use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, HeaderName, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use dashmap::DashMap;
use metrics::counter;
use redis::aio::MultiplexedConnection;
use serde::Deserialize;
use sha2::{Sha256, Digest};
use tokio::sync::Notify;

use crate::config::AppConfig;
use crate::error::AppError;
use crate::types::AuthResult;

const AUTH_HEADER: &str = "Authorization";
const BEARER_PREFIX: &str = "Bearer ";
const INTERNAL_HEADERS: &[&str] = &["x-user-id", "x-org-id", "x-api-key-id"];
const CACHE_KEY_PREFIX: &str = "apikey_hash";

fn hash_api_key(api_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(api_key.as_bytes());
    hex::encode(hasher.finalize())
}

fn cache_key(api_key: &str) -> String {
    format!("{}:{}", CACHE_KEY_PREFIX, hash_api_key(api_key))
}

// --- Auth Service Response ---

#[derive(Debug, Clone, Deserialize)]
struct AuthServiceResponse {
    user_id: String,
    org_id: String,
    status: String,
    quota_limits: HashMap<String, u64>,
}

// --- Per-key inflight dedup ---

type InflightMap = DashMap<String, Arc<Notify>>;

#[derive(Clone)]
pub struct AuthState {
    pub redis: MultiplexedConnection,
    pub http_client: reqwest::Client,
    pub auth_service_url: String,
    pub cache_ttl_secs: u64,
    pub inflight: Arc<InflightMap>,
}

impl AuthState {
    pub fn new(config: &AppConfig, redis: MultiplexedConnection) -> Self {
        Self {
            redis,
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .expect("Failed to build auth HTTP client"),
            auth_service_url: config.auth_service_url.clone(),
            cache_ttl_secs: config.auth_cache_ttl_secs,
            inflight: Arc::new(InflightMap::new()),
        }
    }
}

// --- Middleware entry point ---

pub async fn authenticate(
    State(state): State<AuthState>,
    headers: HeaderMap,
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    // 0. Strip client-injected internal headers
    for header in INTERNAL_HEADERS {
        request.headers_mut().remove(*header);
    }

    // 1. Extract API Key from Authorization header
    let auth_header = headers
        .get(AUTH_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::InvalidApiKey)?;

    let api_key = auth_header
        .strip_prefix(BEARER_PREFIX)
        .ok_or_else(|| {
            metrics::counter!("gateway_auth_failures_total", "reason" => "missing_bearer").increment(1);
            AppError::InvalidApiKey
        })?;

    // 2. Try Redis cache
    let auth_result = match get_cached_auth(&state.redis, api_key).await? {
        Some(result) => result,
        None => {
            // Cache miss → Auth Service (with Notify-based dedup)
            match get_or_wait_for_auth_service(&state, api_key).await {
                Ok(Some(result)) => {
                    cache_auth_result(&state.redis, api_key, &result, state.cache_ttl_secs).await?;
                    result
                }
                Ok(None) => {
                    cache_negative(&state.redis, api_key, 5).await?;
                    metrics::counter!("gateway_auth_failures_total", "reason" => "key_not_found").increment(1);
                    return Err(AppError::InvalidApiKey);
                }
                Err(_) => {
                    metrics::counter!("gateway_auth_failures_total", "reason" => "auth_service_error").increment(1);
                    return Err(AppError::Internal("Auth service unavailable".into()));
                }
            }
        }
    };

    // 3. Inject trusted headers (gracefully handle invalid UTF-8 from Auth Service)
    if let Ok(val) = auth_result.user_id.parse() {
        request.headers_mut().insert(HeaderName::from_static("x-user-id"), val);
    }
    if let Ok(val) = auth_result.org_id.parse() {
        request.headers_mut().insert(HeaderName::from_static("x-org-id"), val);
    }
    if let Ok(val) = auth_result.api_key_id.parse() {
        request.headers_mut().insert(HeaderName::from_static("x-api-key-id"), val);
    }

    // 4. Store AuthResult in extensions for downstream use
    request.extensions_mut().insert(auth_result);

    Ok(next.run(request).await)
}

// --- Redis cache operations ---

async fn get_cached_auth(
    redis: &MultiplexedConnection,
    api_key: &str,
) -> Result<Option<AuthResult>, AppError> {
    let key = cache_key(api_key);
    let mut conn = redis.clone();
    let result: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis GET error: {}", e)))?;

    match result {
        Some(json) => {
            if json == "not_found" {
                return Ok(None); // Cached negative result — key is invalid
            }
            let auth: AuthServiceResponse = serde_json::from_str(&json)
                .map_err(|e| AppError::Internal(format!("Deserialize cached auth: {}", e)))?;
            if auth.status == "revoked" {
                return Err(AppError::RevokedApiKey);
            }
            Ok(Some(AuthResult {
                user_id: auth.user_id,
                org_id: auth.org_id,
                api_key_id: api_key.to_string(),
                quota_limits: auth.quota_limits,
            }))
        }
        None => Ok(None), // True cache miss
    }
}

async fn cache_auth_result(
    redis: &MultiplexedConnection,
    api_key: &str,
    result: &AuthResult,
    ttl_secs: u64,
) -> Result<(), AppError> {
    let key = cache_key(api_key);
    let json = serde_json::json!({
        "user_id": result.user_id,
        "org_id": result.org_id,
        "status": "active",
        "quota_limits": result.quota_limits,
    });
    let mut conn = redis.clone();
    redis::cmd("SETEX")
        .arg(&key)
        .arg(ttl_secs)
        .arg(serde_json::to_string(&json).unwrap())
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis SETEX error: {}", e)))?;
    Ok(())
}

async fn cache_negative(
    redis: &MultiplexedConnection,
    api_key: &str,
    ttl_secs: u64,
) -> Result<(), AppError> {
    let key = cache_key(api_key);
    let mut conn = redis.clone();
    redis::cmd("SETEX")
        .arg(&key)
        .arg(ttl_secs)
        .arg("not_found")
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis SETEX error: {}", e)))?;
    Ok(())
}

// --- Auth Service call with Notify-based dedup ---

async fn get_or_wait_for_auth_service(
    state: &AuthState,
    api_key: &str,
) -> Result<Option<AuthResult>, AppError> {
    // Use DashMap::entry() for atomic check-and-insert — avoids TOCTOU race
    // where two concurrent requests both see no entry and both call Auth Service.
    let notify = match state.inflight.entry(api_key.to_string()) {
        dashmap::mapref::entry::Entry::Occupied(entry) => {
            // Someone else is already fetching — wait for them
            let notify = entry.get().clone();
            drop(entry);
            notify.notified().await;
            // Winner has written to Redis. Re-read.
            return get_cached_auth(&state.redis, api_key).await;
        }
        dashmap::mapref::entry::Entry::Vacant(entry) => {
            // We're the winner — insert a Notify before calling Auth Service
            let notify = Arc::new(Notify::new());
            entry.insert(notify.clone());
            notify
        }
    };

    let result = call_auth_service(state, api_key).await;

    match &result {
        Ok(Some(auth_result)) => {
            let _ = cache_auth_result(&state.redis, api_key, auth_result, state.cache_ttl_secs).await;
        }
        Ok(None) => {
            let _ = cache_negative(&state.redis, api_key, 5).await;
        }
        Err(_) => {
            // Auth Service failed — notify waiters so they can retry
        }
    }

    // Clean up and wake all waiters
    state.inflight.remove(api_key);
    notify.notify_waiters();

    result
}

async fn call_auth_service(
    state: &AuthState,
    api_key: &str,
) -> Result<Option<AuthResult>, AppError> {
    let url = format!("{}/validate-key", state.auth_service_url);
    let response = state
        .http_client
        .post(&url)
        .json(&serde_json::json!({ "api_key": api_key }))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Auth service call failed: {}", e)))?;

    match response.status() {
        StatusCode::OK => {
            let auth: AuthServiceResponse = response
                .json()
                .await
                .map_err(|e| AppError::Internal(format!("Auth response parse: {}", e)))?;
            match auth.status.as_str() {
                "active" => Ok(Some(AuthResult {
                    user_id: auth.user_id,
                    org_id: auth.org_id,
                    api_key_id: api_key.to_string(),
                    quota_limits: auth.quota_limits,
                })),
                "revoked" => Err(AppError::RevokedApiKey),
                _ => Ok(None),
            }
        }
        StatusCode::NOT_FOUND => Ok(None),
        _ => Err(AppError::Internal("Auth service unavailable".into())),
    }
}
