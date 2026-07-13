use axum::{extract::State, Json};
use axum::http::HeaderMap;
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;
use crate::auth::{jwt, api_key as keygen};
use crate::db::api_keys;
use crate::error::AppError;
use crate::revocation::Revocation;

#[derive(Deserialize)]
pub struct KeysRequest {
    pub action: String,   // "create" | "revoke"
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub key_id: Option<String>,
    #[serde(default)]
    pub quota_limits: Option<serde_json::Value>,
}

fn extract_jwt(headers: &HeaderMap, secret: &str) -> Result<jwt::Claims, AppError> {
    let auth = headers.get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    let token = auth.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
    jwt::verify_token(token, secret)
}

pub async fn handler(
    State(pool): State<PgPool>,
    State(revocation): State<Revocation>,
    State(jwt_secret): State<String>,
    headers: HeaderMap,
    Json(req): Json<KeysRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let claims = extract_jwt(&headers, &jwt_secret)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::InvalidToken)?;
    let org_id = Uuid::parse_str(&claims.org_id)
        .map_err(|_| AppError::InvalidToken)?;

    match req.action.as_str() {
        "create" => {
            let plaintext = keygen::generate_key();
            let hash = keygen::hash_key(&plaintext);
            let prefix = keygen::key_prefix(&plaintext);
            let quota = req.quota_limits.unwrap_or(serde_json::json!({"*": 50000}));

            let key = api_keys::create(&pool, &user_id, &org_id, &hash, &prefix, req.name.as_deref(), &quota).await?;

            Ok(Json(serde_json::json!({
                "id": key.id.to_string(),
                "key": plaintext,
                "key_prefix": prefix,
                "name": key.name,
                "created_at": key.created_at.to_rfc3339(),
            })))
        }
        "revoke" => {
            let key_id = req.key_id.as_deref().ok_or(AppError::InvalidCredentials)?;
            let id = Uuid::parse_str(key_id).map_err(|_| AppError::InvalidCredentials)?;

            let key_hash = api_keys::revoke(&pool, &id).await?;

            // ADR-008: Active cache invalidation via Redis
            // 1. Delete from Redis cache (immediate)
            let _ = revocation.delete_cache(&key_hash).await;

            // 2. Publish to Pub/Sub channel (notify all Gateway instances)
            let _ = revocation.publish_revocation(&key_hash).await;

            // 3. Increment revocation version (for Gateway reconnect fallback)
            let version = revocation.increment_version().await?;

            tracing::info!(
                key_id = %key_id,
                key_hash = %key_hash,
                version = version,
                "API key revoked with active cache invalidation"
            );

            Ok(Json(serde_json::json!({
                "status": "revoked",
                "revocation_version": version,
            })))
        }
        _ => Err(AppError::InvalidCredentials),
    }
}
