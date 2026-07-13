# Gateway Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Rust Gateway that authenticates API Keys, routes by request body `model` field, rate-limits by token quota, proxies SSE streams to vLLM, extracts usage for billing, and proxies admin requests to Console API.

**Architecture:** Single axum binary. Tower middleware for auth and observe. Axum extractor for body parsing. Handler-internal calls for route resolution and rate limiting. Handler for chat proxy (SSE tee + usage write) and admin proxy (transparent forward). ArcSwap for route table. Redis for auth cache and rate limit state. PostgreSQL for usage events.

**Tech Stack:** Rust 1.85+, axum 0.8, tokio, tower, reqwest, serde/serde_json, redis-rs, sqlx (PostgreSQL), arc-swap, tracing, metrics + metrics-exporter-prometheus.

**Spec:** `docs/superpowers/specs/2026-07-12-gateway-phase1-design.md`

---

## File Map

```
gateway/
├── Cargo.toml                          # Dependencies
├── config/
│   └── route_table.json                # M1: mock route table
├── src/
│   ├── main.rs                         # Entry: config load, server start, graceful shutdown
│   ├── config.rs                       # Env var parsing → AppConfig struct
│   ├── app.rs                          # axum Router assembly (middleware stacking)
│   ├── health.rs                       # /health, /ready handlers
│   ├── shutdown.rs                     # Graceful shutdown: drain + timeout (M2)
│   ├── types.rs                        # Shared types: AuthResult, RouteInfo, ChatRequest, etc.
│   ├── middleware/
│   │   ├── mod.rs
│   │   ├── auth.rs                     # API Key validation (Redis + Auth Service fallback)
│   │   └── observe.rs                  # Tracing spans + Prometheus metrics (outermost)
│   ├── extract/
│   │   ├── mod.rs
│   │   └── chat_request.rs             # FromRequest: parse body → ChatRequest + cache Bytes
│   ├── route/
│   │   ├── mod.rs
│   │   ├── table.rs                    # RouteTable types + ArcSwap + file loader
│   │   └── resolver.rs                 # model → pool → pod lookup + selection
│   ├── rate_limit.rs                   # Sliding window check via Redis sorted set
│   ├── proxy/
│   │   ├── mod.rs
│   │   ├── chat.rs                     # SSE stream proxy: forward + usage extract
│   │   ├── admin.rs                    # Admin transparent proxy
│   │   └── usage_writer.rs             # PG upsert for raw_usage_events (M2)
│   └── error.rs                        # AppError enum + IntoResponse
└── tests/
    ├── common/
    │   └── mod.rs                      # Test helpers: spawn Redis, mock servers
    └── integration/
        ├── e2e_chat.rs                 # Full chat completions flow
        ├── e2e_admin.rs                # Admin proxy flow
        ├── auth.rs                     # Auth edge cases
        ├── rate_limit.rs               # Rate limit behavior
        └── route.rs                    # Route resolution edge cases
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `gateway/Cargo.toml`
- Create: `gateway/src/main.rs`
- Create: `gateway/src/config.rs`
- Create: `gateway/src/error.rs`
- Create: `gateway/src/types.rs`
- Create: `gateway/src/health.rs`
- Create: `gateway/config/route_table.json`

- [ ] **Step 1: Create `gateway/Cargo.toml` with all dependencies**

```toml
[package]
name = "ultralisk-gateway"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["trace", "cors", "limit"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
redis = { version = "0.27", features = ["tokio-comp", "aio"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono"] }
arc-swap = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
uuid = { version = "1", features = ["v7", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
dashmap = "6"
once_cell = "1"
thiserror = "2"

[dev-dependencies]
axum-test = "16"
testcontainers = "0.23"
testcontainers-modules = { version = "0.11", features = ["redis"] }
wiremock = "0.6"
```

- [ ] **Step 2: Create `gateway/src/config.rs` — environment variable parsing**

```rust
use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub gateway_port: u16,
    pub redis_url: String,
    pub auth_service_url: String,
    pub console_api_url: String,
    pub rate_limit_window_secs: u64,
    pub rate_limit_enabled: bool,
    pub auth_cache_ttl_secs: u64,
    pub upstream_timeout_secs: u64,
    pub admin_upstream_timeout_secs: u64,
    pub route_table_path: String,
    pub database_url: String,
    pub max_body_size: usize,
    pub shutdown_drain_secs: u64,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            gateway_port: env::var("GATEWAY_PORT").unwrap_or_else(|_| "8080".into()).parse().unwrap(),
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into()),
            auth_service_url: env::var("AUTH_SERVICE_URL").unwrap_or_else(|_| "http://localhost:3101".into()),
            console_api_url: env::var("CONSOLE_API_URL").unwrap_or_else(|_| "http://localhost:3100".into()),
            rate_limit_window_secs: env::var("RATE_LIMIT_WINDOW_SECS").unwrap_or_else(|_| "60".into()).parse().unwrap(),
            rate_limit_enabled: env::var("RATE_LIMIT_ENABLED").unwrap_or_else(|_| "true".into()) == "true",
            auth_cache_ttl_secs: env::var("AUTH_CACHE_TTL_SECS").unwrap_or_else(|_| "60".into()).parse().unwrap(),
            upstream_timeout_secs: env::var("UPSTREAM_TIMEOUT_SECS").unwrap_or_else(|_| "60".into()).parse().unwrap(),
            admin_upstream_timeout_secs: env::var("ADMIN_UPSTREAM_TIMEOUT_SECS").unwrap_or_else(|_| "30".into()).parse().unwrap(),
            route_table_path: env::var("ROUTE_TABLE_PATH").unwrap_or_else(|_| "config/route_table.json".into()),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            max_body_size: env::var("MAX_BODY_SIZE").unwrap_or_else(|_| "10485760".into()).parse().unwrap(),
            shutdown_drain_secs: env::var("SHUTDOWN_DRAIN_SECS").unwrap_or_else(|_| "30".into()).parse().unwrap(),
        }
    }
}
```

- [ ] **Step 3: Create `gateway/src/error.rs` — unified error type**

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid API key")]
    InvalidApiKey,
    #[error("API key revoked")]
    RevokedApiKey,
    #[error("Rate limit exceeded")]
    RateLimitExceeded { retry_after: u64 },
    #[error("Model not found: {0}")]
    ModelNotFound(String),
    #[error("Model not available: {0}")]
    ModelNotAvailable(String),
    #[error("Upstream error: {0}")]
    UpstreamError(String),
    #[error("Upstream timeout")]
    UpstreamTimeout,
    #[error("Invalid request: {0}")]
    InvalidRequest(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after: Option<u64>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, retry_after) = match &self {
            AppError::InvalidApiKey => (StatusCode::UNAUTHORIZED, "invalid_api_key", None),
            AppError::RevokedApiKey => (StatusCode::UNAUTHORIZED, "revoked_api_key", None),
            AppError::RateLimitExceeded { retry_after } => {
                (StatusCode::TOO_MANY_REQUESTS, "rate_limit_exceeded", Some(*retry_after))
            }
            AppError::ModelNotFound(_) => (StatusCode::NOT_FOUND, "model_not_found", None),
            AppError::ModelNotAvailable(_) => (StatusCode::SERVICE_UNAVAILABLE, "model_not_available", None),
            AppError::UpstreamError(_) => (StatusCode::BAD_GATEWAY, "upstream_error", None),
            AppError::UpstreamTimeout => (StatusCode::GATEWAY_TIMEOUT, "upstream_timeout", None),
            AppError::InvalidRequest(_) => (StatusCode::BAD_REQUEST, "invalid_request", None),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", None),
        };

        let body = ErrorBody {
            error: ErrorDetail {
                code: code.to_string(),
                message: self.to_string(),
                retry_after,
            },
        };

        (status, Json(body)).into_response()
    }
}
```

- [ ] **Step 4: Create `gateway/src/types.rs` — shared types**

```rust
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// --- API Key auth result, stored in extensions ---

#[derive(Clone, Debug)]
pub struct AuthResult {
    pub user_id: String,
    pub org_id: String,
    pub api_key_id: String,
    pub quota_limits: HashMap<String, u64>,  // model_id → token_limit_per_window
}

// --- Parsed chat completion request, stored in extensions ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub stream: bool,
    // Other fields passthrough handled by serde(flatten) or ignored
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

fn default_max_tokens() -> u32 { 256 }

// --- Route resolution result, stored in extensions ---

#[derive(Clone, Debug)]
pub struct RouteInfo {
    pub model_id: String,
    pub pool_name: String,
    pub pod_address: String,
    pub strategy: String,
}

// --- Request context, built incrementally in extensions ---

#[derive(Clone, Debug)]
pub struct RequestContext {
    pub request_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
}
```

- [ ] **Step 5: Create `gateway/src/health.rs`**

```rust
use axum::http::StatusCode;
use axum::response::IntoResponse;
use arc_swap::ArcSwap;
use redis::aio::MultiplexedConnection;

use crate::route::table::RouteTable;

pub async fn health() -> impl IntoResponse {
    StatusCode::OK
}

pub async fn ready(
    redis: axum::extract::State<MultiplexedConnection>,
    route_table: axum::extract::State<arc_swap::ArcSwapAny<RouteTable>>,
) -> impl IntoResponse {
    // Check Redis connectivity with PING
    let mut conn = redis.clone();
    let redis_ok = redis::cmd("PING")
        .query_async::<String>(&mut conn)
        .await
        .is_ok();

    // Check route table is non-empty
    let table = route_table.load();
    let routes_ok = !table.routes.is_empty();

    if redis_ok && routes_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}
```

- [ ] **Step 6: Create `gateway/src/main.rs` — minimal hello-world server**

```rust
mod config;
mod error;
mod health;
mod types;
mod middleware;
mod extract;
mod route;
mod rate_limit;
mod proxy;
mod shutdown;
mod app;

use config::AppConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env();
    tracing::info!("Starting Gateway on port {}", config.gateway_port);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.gateway_port)).await?;
    axum::serve(listener, app::build(config).await?).await?;

    Ok(())
}
```

- [ ] **Step 7: Create `gateway/config/route_table.json`**

```json
{
  "version": 1,
  "routes": {
    "llama-3.1-8b-instruct": {
      "name": "serverless-llama8b",
      "strategy": "serverless",
      "pods": [
        {"id": "vllm-8b-01", "address": "localhost:8000", "weight": 1}
      ]
    }
  }
}
```

- [ ] **Step 8: Verify it compiles**

Run: `cd gateway && cargo check`
Expected: Clean compile (with unused warnings for stub modules)

- [ ] **Step 9: Commit**

```bash
cd /Users/nicholasl/Documents/build-whatever/Ultralisk
git add gateway/
git commit -m "feat(gateway): project scaffold with config, types, error, health"
```

---

### Task 2: Route Table (data types + file loader + ArcSwap)

**Files:**
- Create: `gateway/src/route/mod.rs`
- Create: `gateway/src/route/table.rs`
- Create: `gateway/src/route/resolver.rs`

- [ ] **Step 1: Create `gateway/src/route/table.rs` — data structures and loader**

```rust
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use arc_swap::ArcSwap;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct RouteTableConfig {
    pub version: u64,
    pub routes: HashMap<String, PoolConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PoolConfig {
    pub name: String,
    pub strategy: String,
    pub pods: Vec<PodConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PodConfig {
    pub id: String,
    pub address: String,
    pub weight: u32,
}

// --- Runtime types ---

#[derive(Debug, Clone)]
pub struct RouteTable {
    pub routes: HashMap<String, Pool>,
    pub version: u64,
}

#[derive(Debug, Clone)]
pub struct Pool {
    pub name: String,
    pub pods: Vec<Pod>,
    pub strategy: String,  // informational only in Phase 1
}

#[derive(Debug, Clone)]
pub struct Pod {
    pub id: String,
    pub address: String,
    pub weight: u32,  // Phase 1 always 1
}

/// Global route table singleton
pub static ROUTE_TABLE: once_cell::sync::Lazy<ArcSwap<RouteTable>> = once_cell::sync::Lazy::new(|| {
    ArcSwap::from_pointee(RouteTable {
        routes: HashMap::new(),
        version: 0,
    })
});

/// Load route table from JSON file. Called synchronously at startup.
/// Panics if file is missing or invalid — Gateway cannot run without routes.
pub fn load_route_table(path: &str) -> RouteTable {
    let content = std::fs::read_to_string(path)
        .expect(&format!("Failed to read route table from {}", path));
    let config: RouteTableConfig = serde_json::from_str(&content)
        .expect("Failed to parse route table JSON");

    let routes: HashMap<String, Pool> = config.routes.into_iter().map(|(model_id, pool_cfg)| {
        let pool = Pool {
            name: pool_cfg.name,
            strategy: pool_cfg.strategy,
            pods: pool_cfg.pods.into_iter().map(|p| Pod {
                id: p.id,
                address: p.address,
                weight: p.weight,
            }).collect(),
        };
        (model_id, pool)
    }).collect();

    RouteTable { routes, version: config.version }
}
```

- [ ] **Step 2: Create `gateway/src/route/resolver.rs` — model → pod resolution**

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use crate::types::RouteInfo;
use super::table::{ROUTE_TABLE, Pool};

/// Round-robin counter per pool. Key: pool name.
static RR_COUNTERS: once_cell::sync::Lazy<dashmap::DashMap<String, AtomicU64>> =
    once_cell::sync::Lazy::new(|| dashmap::DashMap::new());

/// Resolve model_id → RouteInfo (pod address + metadata).
/// Returns Err with (status, code) for 404/503.
pub fn resolve(model_id: &str) -> Result<RouteInfo, (axum::http::StatusCode, &'static str)> {
    let table = ROUTE_TABLE.load();

    let pool = table.routes.get(model_id)
        .ok_or((axum::http::StatusCode::NOT_FOUND, "model_not_found"))?;

    if pool.pods.is_empty() {
        // Phase 1 M1-M2: 503. Phase 1 M3: cold start queue.
        return Err((axum::http::StatusCode::SERVICE_UNAVAILABLE, "model_not_available"));
    }

    let pod = select_pod(pool);

    Ok(RouteInfo {
        model_id: model_id.to_string(),
        pool_name: pool.name.clone(),
        pod_address: pod.address.clone(),
        strategy: pool.strategy.clone(),
    })
}

fn select_pod(pool: &Pool) -> &super::table::Pod {
    let counter = RR_COUNTERS.entry(pool.name.clone())
        .or_insert_with(|| AtomicU64::new(0));

    let idx = counter.fetch_add(1, Ordering::Relaxed) as usize % pool.pods.len();
    &pool.pods[idx]
}
```

- [ ] **Step 3: Create `gateway/src/route/mod.rs`**

```rust
pub mod table;
pub mod resolver;
```

- [ ] **Step 4: Write unit test `gateway/src/route/table.rs` (append to file)**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_route_table() {
        let json = r#"{
            "version": 1,
            "routes": {
                "model-a": {
                    "name": "pool-a",
                    "strategy": "serverless",
                    "pods": [
                        {"id": "pod-1", "address": "10.0.0.1:8000", "weight": 1}
                    ]
                }
            }
        }"#;

        let config: RouteTableConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.version, 1);
        assert_eq!(config.routes.len(), 1);
        let pool = config.routes.get("model-a").unwrap();
        assert_eq!(pool.pods.len(), 1);
        assert_eq!(pool.pods[0].address, "10.0.0.1:8000");
    }

    #[test]
    fn test_empty_routes() {
        let json = r#"{"version": 0, "routes": {}}"#;
        let config: RouteTableConfig = serde_json::from_str(json).unwrap();
        assert!(config.routes.is_empty());
    }
}
```

- [ ] **Step 5: Write unit test `gateway/src/route/resolver.rs` (append to file)**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::route::table::Pod;

    #[test]
    fn test_round_robin_selects_cyclically() {
        let pool = Pool {
            name: "test-pool".into(),
            strategy: "serverless".into(),
            pods: vec![
                Pod { id: "a".into(), address: "addr-a".into(), weight: 1 },
                Pod { id: "b".into(), address: "addr-b".into(), weight: 1 },
                Pod { id: "c".into(), address: "addr-c".into(), weight: 1 },
            ],
        };

        let first = select_pod(&pool);
        let second = select_pod(&pool);
        let third = select_pod(&pool);
        let fourth = select_pod(&pool);

        assert_eq!(first.address, "addr-a");
        assert_eq!(second.address, "addr-b");
        assert_eq!(third.address, "addr-c");
        assert_eq!(fourth.address, "addr-a"); // wraps around
    }
}
```

- [ ] **Step 6: Run tests**

Run: `cd gateway && cargo test route::`
Expected: All 3 tests pass

- [ ] **Step 7: Commit**

```bash
git add gateway/src/route/ gateway/config/
git commit -m "feat(gateway): route table types, file loader, round-robin resolver"
```

---

### Task 3: Auth Middleware (Redis cache + Auth Service fallback)

**Files:**
- Create: `gateway/src/middleware/mod.rs`
- Create: `gateway/src/middleware/auth.rs`

- [ ] **Step 1: Create `gateway/src/middleware/auth.rs`**

```rust
use std::collections::HashMap;
use std::sync::Arc;
use axum::{
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use redis::aio::MultiplexedConnection;
use serde::Deserialize;
use tokio::sync::oneshot;

use crate::config::AppConfig;
use crate::error::AppError;
use crate::types::AuthResult;

const AUTH_HEADER: &str = "Authorization";
const BEARER_PREFIX: &str = "Bearer ";
const INTERNAL_HEADERS: &[&str] = &["x-user-id", "x-org-id", "x-api-key-id"];

#[derive(Debug, Clone, Deserialize)]
struct AuthServiceResponse {
    user_id: String,
    org_id: String,
    status: String,  // "active" | "revoked"
    quota_limits: HashMap<String, u64>,
}

#[derive(Debug, Clone)]
struct CachedAuth {
    auth_result: Option<AuthResult>,  // None = key invalid/revoked
}

/// Per-key inflight request tracking.
/// Key: api_key. Value: Notify that fires when the winner's Auth Service call completes.
/// Waiters re-read Redis after being notified (winner has already cached the result).
type InflightMap = DashMap<String, Arc<tokio::sync::Notify>>;

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
            http_client: reqwest::Client::new(),
            auth_service_url: config.auth_service_url.clone(),
            cache_ttl_secs: config.auth_cache_ttl_secs,
            inflight: Arc::new(InflightMap::new()),
        }
    }
}

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
    let auth_header = headers.get(AUTH_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::InvalidApiKey)?;

    let api_key = auth_header
        .strip_prefix(BEARER_PREFIX)
        .ok_or(AppError::InvalidApiKey)?;

    // 2. Try Redis cache
    let auth_result = match get_cached_auth(&state.redis, api_key).await? {
        Some(result) => result,
        None => {
            // 3. Cache miss → Auth Service (with oneshot dedup)
            match get_or_wait_for_auth_service(&state, api_key).await? {
                Some(result) => {
                    // Cache the result
                    cache_auth_result(&state.redis, api_key, &result, state.cache_ttl_secs).await?;
                    result
                }
                None => {
                    // Key invalid/revoked — cache negative result with short TTL (5s)
                    cache_negative(&state.redis, api_key, 5).await?;
                    return Err(AppError::InvalidApiKey);
                }
            }
        }
    };

    // 4. Inject trusted headers
    request.headers_mut().insert(
        axum::http::HeaderName::from_static("x-user-id"),
        auth_result.user_id.parse().unwrap(),
    );
    request.headers_mut().insert(
        axum::http::HeaderName::from_static("x-org-id"),
        auth_result.org_id.parse().unwrap(),
    );
    request.headers_mut().insert(
        axum::http::HeaderName::from_static("x-api-key-id"),
        auth_result.api_key_id.parse().unwrap(),
    );

    // 5. Store AuthResult in extensions
    request.extensions_mut().insert(auth_result);

    Ok(next.run(request).await)
}

async fn get_cached_auth(
    redis: &MultiplexedConnection,
    api_key: &str,
) -> Result<Option<AuthResult>, AppError> {
    let key = format!("apikey:{}", api_key);
    let mut conn = redis.clone();
    let result: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis error: {}", e)))?;

    match result {
        Some(json) => {
            if json == "not_found" {
                Ok(None) // Cached negative result
            } else {
                let auth: AuthServiceResponse = serde_json::from_str(&json)
                    .map_err(|e| AppError::Internal(format!("Deserialize error: {}", e)))?;
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
        }
        None => Ok(None), // True cache miss
    }
}

async fn get_or_wait_for_auth_service(
    state: &AuthState,
    api_key: &str,
) -> Result<Option<AuthResult>, AppError> {
    // Check if there's already an inflight request for this key
    if let Some(notify) = state.inflight.get(api_key) {
        // Someone else is already fetching — wait for them to finish
        let notify = notify.value().clone(); // Arc<Notify> is Clone
        notify.notified().await;
        // Winner has written to Redis (or failed and removed the entry). Re-read Redis.
        return get_cached_auth(&state.redis, api_key).await;
    }

    // No inflight — we're the winner
    let notify = Arc::new(tokio::sync::Notify::new());
    state.inflight.insert(api_key.to_string(), notify.clone());

    let result = call_auth_service(state, api_key).await;

    match &result {
        Ok(Some(auth_result)) => {
            // Success: write to Redis, then notify waiters
            cache_auth_result(&state.redis, api_key, auth_result, state.cache_ttl_secs).await?;
        }
        Ok(None) => {
            // Key not found: cache negative, then notify
            cache_negative(&state.redis, api_key, 5).await?;
        }
        Err(_) => {
            // Auth Service failed: notify waiters so they can retry (with jitter)
        }
    }

    // Clean up and wake waiters
    state.inflight.remove(api_key);
    notify.notify_waiters();

    result
}

async fn call_auth_service(
    state: &AuthState,
    api_key: &str,
) -> Result<Option<AuthResult>, AppError> {
    let url = format!("{}/validate-key", state.auth_service_url);
    let response = state.http_client
        .post(&url)
        .json(&serde_json::json!({ "api_key": api_key }))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Auth service error: {}", e)))?;

    match response.status() {
        StatusCode::OK => {
            let auth: AuthServiceResponse = response.json().await
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

async fn cache_auth_result(
    redis: &MultiplexedConnection,
    api_key: &str,
    result: &AuthResult,
    ttl_secs: u64,
) -> Result<(), AppError> {
    let key = format!("apikey:{}", api_key);
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
        .map_err(|e| AppError::Internal(format!("Redis cache write: {}", e)))?;
    Ok(())
}

async fn cache_negative(
    redis: &MultiplexedConnection,
    api_key: &str,
    ttl_secs: u64,
) -> Result<(), AppError> {
    let key = format!("apikey:{}", api_key);
    let mut conn = redis.clone();
    redis::cmd("SETEX")
        .arg(&key)
        .arg(ttl_secs)
        .arg("not_found")
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis cache write: {}", e)))?;
    Ok(())
}

impl From<AppError> for Response {
    fn from(err: AppError) -> Self {
        err.into_response()
    }
}
```

- [ ] **Step 2: Create `gateway/src/middleware/mod.rs`**

```rust
pub mod auth;
pub mod observe;
```

- [ ] **Step 3: Run cargo check**

Run: `cd gateway && cargo check`
Expected: Compile errors for missing `rand` dependency. Fix: add `rand = "0.8"` to Cargo.toml dev-dependencies, or replace jitter with simple constant.

- [ ] **Step 4: Verify compile**

Run: `cd gateway && cargo check`
Expected: Clean compile, unused import warnings OK

- [ ] **Step 5: Commit**

```bash
git add gateway/src/middleware/ gateway/Cargo.toml
git commit -m "feat(gateway): auth middleware with Redis cache + Auth Service fallback + oneshot dedup"
```

---

### Task 4: ChatRequest Extractor

**Files:**
- Create: `gateway/src/extract/mod.rs`
- Create: `gateway/src/extract/chat_request.rs`

- [ ] **Step 1: Create `gateway/src/extract/chat_request.rs`**

```rust
use axum::{
    body::Bytes,
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use crate::types::ChatRequest;

/// Extracts ChatRequest from the request body, caching raw Bytes for downstream proxy.
/// On success, stores both `ChatRequest` and raw `Bytes` in request extensions.
pub struct ChatRequestExtractor {
    pub request: ChatRequest,
    pub raw_body: Bytes,
}

impl<S> FromRequest<S> for ChatRequestExtractor
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let (parts, body) = req.into_parts();

        let bytes = Bytes::from_request(
            Request::from_parts(parts, body),
            state,
        ).await.map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Failed to read body: {}", e)).into_response()
        })?;

        let request: ChatRequest = serde_json::from_slice(&bytes).map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Invalid JSON: {}", e)).into_response()
        })?;

        // Validate model field is present and non-empty
        if request.model.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Model field is required").into_response());
        }

        Ok(ChatRequestExtractor {
            request,
            raw_body: bytes,
        })
    }
}
```

- [ ] **Step 2: Create `gateway/src/extract/mod.rs`**

```rust
pub mod chat_request;
```

- [ ] **Step 3: Write unit test `gateway/src/extract/chat_request.rs` (append)**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;

    #[tokio::test]
    async fn test_valid_chat_request() {
        let body = Body::from(r#"{"model":"llama-8b","messages":[{"role":"user","content":"hi"}]}"#);
        let req = Request::builder().body(body).unwrap();

        let extractor = ChatRequestExtractor::from_request(req, &()).await.unwrap();
        assert_eq!(extractor.request.model, "llama-8b");
        assert_eq!(extractor.request.messages.len(), 1);
        assert_eq!(extractor.request.stream, false); // default
        assert!(!extractor.raw_body.is_empty());
    }

    #[tokio::test]
    async fn test_invalid_json_rejects() {
        let body = Body::from("not json");
        let req = Request::builder().body(body).unwrap();
        let result = ChatRequestExtractor::from_request(req, &()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_missing_model_rejects() {
        let body = Body::from(r#"{"messages":[{"role":"user","content":"hi"}]}"#);
        let req = Request::builder().body(body).unwrap();
        let result = ChatRequestExtractor::from_request(req, &()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_stream_defaults_to_false() {
        let body = Body::from(r#"{"model":"llama-8b","messages":[{"role":"user","content":"hi"}]}"#);
        let req = Request::builder().body(body).unwrap();
        let extractor = ChatRequestExtractor::from_request(req, &()).await.unwrap();
        assert!(!extractor.request.stream);
    }

    #[tokio::test]
    async fn test_stream_explicitly_true() {
        let body = Body::from(r#"{"model":"llama-8b","messages":[{"role":"user","content":"hi"}],"stream":true}"#);
        let req = Request::builder().body(body).unwrap();
        let extractor = ChatRequestExtractor::from_request(req, &()).await.unwrap();
        assert!(extractor.request.stream);
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd gateway && cargo test extract::`
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add gateway/src/extract/
git commit -m "feat(gateway): ChatRequest FromRequest extractor with body Bytes caching"
```

---

### Task 5: Rate Limiter (Redis sorted set sliding window)

**Files:**
- Create: `gateway/src/rate_limit.rs`

- [ ] **Step 1: Create `gateway/src/rate_limit.rs`**

```rust
use std::time::{SystemTime, UNIX_EPOCH};
use redis::aio::MultiplexedConnection;
use crate::error::AppError;

const DEFAULT_QUOTA: u64 = 50_000; // tokens per window

/// Check rate limit for (api_key_id, model).
/// Returns Ok(()) if under limit, Err(RateLimitExceeded) if over.
pub async fn check(
    redis: &MultiplexedConnection,
    api_key_id: &str,
    model: &str,
    quota_limit: Option<u64>,
    window_secs: u64,
    estimated_tokens: u64,
) -> Result<(), AppError> {
    let limit = quota_limit.unwrap_or(DEFAULT_QUOTA);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let key = format!("ratelimit:{}:{}:{}", window_secs, api_key_id, model);
    let window_start = now_ms - (window_secs * 1000);

    let mut conn = redis.clone();

    // 1. Remove expired entries
    redis::cmd("ZREMRANGEBYSCORE")
        .arg(&key)
        .arg("-inf")
        .arg(window_start)
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis ZREMRANGEBYSCORE: {}", e)))?;

    // 2. Sum tokens in window
    let total: u64 = redis::cmd("ZRANGEBYSCORE")
        .arg(&key)
        .arg(window_start)
        .arg("+inf")
        .query_async::<Vec<String>>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis ZRANGEBYSCORE: {}", e)))?
        .iter()
        .filter_map(|member| {
            // Format: "timestamp_ms:tokens"
            member.split(':').nth(1).and_then(|t| t.parse::<u64>().ok())
        })
        .sum();

    // 3. Check and record
    if total + estimated_tokens > limit {
        let retry_after = window_secs;
        return Err(AppError::RateLimitExceeded { retry_after });
    }

    // 4. Add current request
    let member = format!("{}:{}", now_ms, estimated_tokens);
    redis::cmd("ZADD")
        .arg(&key)
        .arg(now_ms)  // score = timestamp
        .arg(&member)
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis ZADD: {}", e)))?;

    // Set key expiry to window * 2 for cleanup
    redis::cmd("EXPIRE")
        .arg(&key)
        .arg(window_secs * 2)
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis EXPIRE: {}", e)))?;

    Ok(())
}

/// Estimate tokens from the request before inference happens.
/// Phase 1: input chars / 4 + max_tokens. Phase 2: real usage.
pub fn estimate_tokens(input_text: &str, max_tokens: u32) -> u64 {
    (input_text.chars().count() as u64 / 4) + max_tokens as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        // "hello world" = 11 chars, max_tokens = 100
        let estimate = estimate_tokens("hello world", 100);
        assert_eq!(estimate, 11 / 4 + 100); // 2 + 100 = 102
    }

    #[test]
    fn test_estimate_tokens_empty_input() {
        let estimate = estimate_tokens("", 256);
        assert_eq!(estimate, 256);
    }

    #[test]
    fn test_estimate_tokens_long_input() {
        let long = "a".repeat(1000);
        let estimate = estimate_tokens(&long, 500);
        assert_eq!(estimate, 1000 / 4 + 500); // 250 + 500 = 750
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd gateway && cargo test rate_limit::`
Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add gateway/src/rate_limit.rs
git commit -m "feat(gateway): rate limiter with Redis sorted set sliding window"
```

---

### Task 6: Chat Proxy Handler (non-streaming first)

**Files:**
- Create: `gateway/src/proxy/mod.rs`
- Create: `gateway/src/proxy/chat.rs`

- [ ] **Step 1: Create `gateway/src/proxy/chat.rs` — non-streaming forward**

```rust
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::types::{AuthResult, RouteInfo, RequestContext};
use crate::extract::chat_request::ChatRequestExtractor;

#[derive(Clone)]
pub struct ProxyState {
    pub http_client: Client,
    pub timeout_secs: u64,
}

impl ProxyState {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            http_client: Client::builder()
                .timeout(std::time::Duration::from_secs(config.upstream_timeout_secs))
                .build()
                .unwrap(),
            timeout_secs: config.upstream_timeout_secs,
        }
    }
}

/// Handle /v1/chat/completions — non-streaming path (Phase 1 M1)
pub async fn handle_chat(
    State(state): State<ProxyState>,
    auth: Option<axum::extract::Extension<AuthResult>>,
    route_info: Option<axum::extract::Extension<RouteInfo>>,
    chat_extractor: ChatRequestExtractor,
) -> Result<Response, AppError> {
    let _auth = auth.ok_or(AppError::Internal("Auth missing".into()))?;
    let route = route_info.ok_or(AppError::Internal("Route missing".into()))?;

    let upstream_url = format!("http://{}/v1/chat/completions", route.pod_address);

    // Build forward request — strip internal headers
    let response = state.http_client
        .post(&upstream_url)
        .header("host", &route.pod_address)
        .header("content-type", "application/json")
        .body(chat_extractor.raw_body)
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    let body = response.bytes().await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    // Extract usage from final response (non-streaming) and write to PG
    if status.is_success() {
        if let Ok(usage_json) = serde_json::from_slice::<serde_json::Value>(&body) {
            if let Some(usage) = usage_json.get("usage") {
                // Spawn usage write — don't block response
                let _ = extract_and_write_usage(usage).await;
            }
        }
    }

    // Build response — copy upstream status and body
    let mut response_builder = axum::response::Response::builder().status(status);
    response_builder = response_builder.header("content-type", "application/json");
    Ok(response_builder.body(axum::body::Body::from(body)).unwrap())
}

async fn extract_and_write_usage(usage: &serde_json::Value) -> Result<(), AppError> {
    // Placeholder — will be wired to usage_writer in Task 13
    let prompt_tokens = usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let completion_tokens = usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    tracing::info!(prompt_tokens, completion_tokens, "Usage extracted");
    Ok(())
}
```

- [ ] **Step 2: Create `gateway/src/proxy/mod.rs`**

```rust
pub mod chat;
pub mod admin;
pub mod usage_writer;
```

- [ ] **Step 3: Run cargo check**

Run: `cd gateway && cargo check`
Expected: Compile (unused import warnings OK)

- [ ] **Step 4: Commit**

```bash
git add gateway/src/proxy/
git commit -m "feat(gateway): chat proxy handler (non-streaming, usage placeholder)"
```

---

### Task 7: Admin Proxy Handler

**Files:**
- Create: `gateway/src/proxy/admin.rs`

- [ ] **Step 1: Create `gateway/src/proxy/admin.rs`**

```rust
use axum::{
    body::Body,
    extract::{Request, State},
    http::{HeaderValue, Method},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::types::AuthResult;

#[derive(Clone)]
pub struct AdminProxyState {
    pub http_client: Client,
    pub console_api_url: String,
    pub timeout_secs: u64,
}

impl AdminProxyState {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            http_client: Client::builder()
                .timeout(std::time::Duration::from_secs(config.admin_upstream_timeout_secs))
                .build()
                .unwrap(),
            console_api_url: config.console_api_url.clone(),
            timeout_secs: config.admin_upstream_timeout_secs,
        }
    }
}

/// Proxy /v1/admin/* to Console API. Strips and re-injects internal headers.
pub async fn handle_admin(
    State(state): State<AdminProxyState>,
    auth: Option<axum::extract::Extension<AuthResult>>,
    mut request: Request,
) -> Result<Response, AppError> {
    let auth = auth.ok_or(AppError::Internal("Auth missing".into()))?;

    // Construct upstream URL: CONSOLE_API_URL + original_path + query
    let path = request.uri().path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let upstream_url = format!("{}{}", state.console_api_url.trim_end_matches('/'), path);

    // Read request body
    let body_bytes = axum::body::to_bytes(request.body_mut(), 10 * 1024 * 1024)
        .await
        .map_err(|e| AppError::InvalidRequest(format!("Body too large: {}", e)))?;

    // Strip internal headers, inject trusted values
    for header in &["x-user-id", "x-org-id", "x-api-key-id"] {
        request.headers_mut().remove(*header);
    }

    // Build forwarding request
    let mut req_builder = state.http_client
        .request(request.method().clone(), &upstream_url)
        .header("x-user-id", &auth.user_id)
        .header("x-org-id", &auth.org_id)
        .header("x-api-key-id", &auth.api_key_id);

    // Copy all remaining client headers
    for (name, value) in request.headers() {
        if name.as_str().to_lowercase() != "host" {
            req_builder = req_builder.header(name.as_str(), value.as_bytes());
        }
    }

    let response = req_builder
        .body(body_bytes)
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    let resp_body = response.bytes().await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(resp_body))
        .unwrap())
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd gateway && cargo check`
Expected: Compile

- [ ] **Step 3: Commit**

```bash
git add gateway/src/proxy/admin.rs
git commit -m "feat(gateway): admin proxy handler with transparent forwarding"
```

---

### Task 8: Observe Middleware (tracing + Prometheus)

**Files:**
- Create: `gateway/src/middleware/observe.rs`

- [ ] **Step 1: Create `gateway/src/middleware/observe.rs`**

```rust
use std::time::Instant;
use axum::{
    extract::Request,
    middleware::Next,
    response::{IntoResponse, Response},
};
use metrics::{counter, histogram};
use uuid::Uuid;
use crate::types::RequestContext;

pub async fn observe(mut request: Request, next: Next) -> Response {
    let request_id = Uuid::now_v7().to_string();
    let started_at = chrono::Utc::now();
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let start = Instant::now();

    // Inject request context into extensions
    request.extensions_mut().insert(RequestContext {
        request_id: request_id.clone(),
        started_at,
    });

    // Create tracing span
    let span = tracing::info_span!(
        "request",
        request_id = %request_id,
        method = %method,
        path = %path,
    );
    let _guard = span.enter();

    tracing::info!("Request started");

    let response = next.run(request).await;

    let status = response.status();
    let duration = start.elapsed();

    // Record metrics
    counter!("gateway_requests_total",
        "method" => method.to_string(),
        "path" => path.clone(),
        "status" => status.as_u16().to_string(),
    );
    histogram!("gateway_request_duration_seconds",
        "method" => method.to_string(),
        "path" => path,
    ).record(duration.as_secs_f64());

    tracing::info!(
        status = %status,
        duration_ms = %duration.as_millis(),
        "Request completed"
    );

    response
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd gateway && cargo check`
Expected: Compile (need to ensure `metrics` and `uuid` are in Cargo.toml — already added in Task 1)

- [ ] **Step 3: Commit**

```bash
git add gateway/src/middleware/observe.rs
git commit -m "feat(gateway): observe middleware with tracing spans and prometheus metrics"
```

---

### Task 9: App Assembly (Router + middleware stacking + server start)

**Files:**
- Create: `gateway/src/app.rs`
- Update: `gateway/src/main.rs`

- [ ] **Step 1: Create `gateway/src/app.rs`**

```rust
use std::sync::Arc;
use axum::{
    middleware,
    routing::{any, get, post},
    Router,
};
use redis::aio::MultiplexedConnection;
use tower_http::limit::RequestBodyLimitLayer;

use crate::config::AppConfig;
use crate::extract::chat_request::ChatRequestExtractor;
use crate::middleware::auth::{self, AuthState};
use crate::middleware::observe;
use crate::proxy::chat::{self, ProxyState};
use crate::proxy::admin::{self, AdminProxyState};
use crate::route::table::{self, ROUTE_TABLE};
use crate::route::resolver;
use crate::rate_limit;
use crate::health;

pub async fn build(config: AppConfig) -> anyhow::Result<Router> {
    // Initialize Redis
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis_conn = redis_client.get_multiplexed_async_connection().await?;

    // Load route table synchronously before server starts
    let rt = table::load_route_table(&config.route_table_path);
    ROUTE_TABLE.store(Arc::new(rt));
    tracing::info!("Route table loaded from {}", config.route_table_path);

    // Auth state
    let auth_state = AuthState::new(&config, redis_conn.clone());

    // Proxy states
    let proxy_state = ProxyState::new(&config);
    let admin_proxy_state = AdminProxyState::new(&config);

    // Prometheus metrics handle
    let recorder = metrics_exporter_prometheus::PrometheusBuilder::new().build_recorder();
    let metrics_handle = recorder.handle();
    metrics::set_boxed_recorder(Box::new(recorder))?;

    // --- Router assembly ---
    // Chat completions path (needs proxy_state + redis_conn in State)
    let chat_router = Router::new()
        .route("/v1/chat/completions", post(chat_handler))
        .with_state(proxy_state.clone())
        .with_state(redis_conn.clone())
        .route_layer(middleware::from_fn_with_state(auth_state.clone(), auth::authenticate));

    // Admin path (needs admin_proxy_state)
    let admin_router = Router::new()
        .route("/v1/admin/{*path}", any(admin_handler))
        .with_state(admin_proxy_state)
        .route_layer(middleware::from_fn_with_state(auth_state, auth::authenticate));

    // Health + metrics (no auth)
    let infra_router = Router::new()
        .route("/health", get(health::health))
        .route("/ready", get({
            let redis = redis_conn.clone();
            move || health::ready(
                axum::extract::State(redis.clone()),
                axum::extract::State(ROUTE_TABLE.clone()),
            )
        }))
        .route("/metrics", get(move || {
            let handle = metrics_handle.clone();
            async move { handle.render() }
        }));

    let app = Router::new()
        .merge(chat_router)
        .merge(admin_router)
        .merge(infra_router)
        // Outermost layers
        .layer(middleware::from_fn(observe::observe))
        .layer(RequestBodyLimitLayer::new(config.max_body_size));

    Ok(app)
}

// Handler that ties together extraction, routing, rate limiting, and proxying
async fn chat_handler(
    State(proxy_state): State<ProxyState>,
    State(redis_conn): State<MultiplexedConnection>,
    Extension(auth): Extension<crate::types::AuthResult>,
    chat_extractor: ChatRequestExtractor,
) -> Result<Response, AppError> {
    // 1. Route resolution
    let route_info = resolver::resolve(&chat_extractor.request.model)
        .map_err(|(status, code)| {
            match status.as_u16() {
                404 => AppError::ModelNotFound(chat_extractor.request.model.clone()),
                _ => AppError::ModelNotAvailable(chat_extractor.request.model.clone()),
            }
        })?;

    // 2. Rate limit check
    let quota = auth.quota_limits.get(&chat_extractor.request.model)
        .or_else(|| auth.quota_limits.get("*"))
        .copied();

    let estimated = rate_limit::estimate_tokens(
        &chat_extractor.request.messages.iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join(" "),
        chat_extractor.request.max_tokens,
    );

    rate_limit::check(
        &redis_conn,
        &auth.api_key_id,
        &chat_extractor.request.model,
        quota,
        60, // window_secs — TODO: use AppConfig
        estimated,
    ).await?;

    // 3. Proxy to vLLM
    chat::handle_chat(
        State(proxy_state),
        Some(Extension(auth)),
        Some(Extension(route_info)),
        chat_extractor,
    ).await
}

async fn admin_handler(
    State(state): State<AdminProxyState>,
    Extension(auth): Extension<crate::types::AuthResult>,
    request: Request,
) -> Result<Response, AppError> {
    admin::handle_admin(State(state), Some(Extension(auth)), request).await
}
```

- [ ] **Step 2: Update `gateway/src/main.rs`** to use app::build

Replace main.rs content:
```rust
mod config;
mod error;
mod health;
mod types;
mod middleware;
mod extract;
mod route;
mod rate_limit;
mod proxy;
mod app;

use config::AppConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let config = AppConfig::from_env();
    tracing::info!("Starting Gateway on port {}", config.gateway_port);

    let app = app::build(config.clone()).await?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.gateway_port)).await?;
    tracing::info!("Gateway listening on port {}", config.gateway_port);

    // Graceful shutdown (M2: replace with shutdown.rs drain logic)
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
            tracing::info!("Shutdown signal received");
        })
        .await?;

    Ok(())
}
```

- [ ] **Step 3: Run cargo check**

Run: `cd gateway && cargo check`
Expected: Several compile errors — the `app.rs` handler structure needs refinement. Key issues to fix:
- State types need wrapping (`axum::extract::State` wrapping)
- Extension imports
- Router type annotations

- [ ] **Step 4: Iterate compile fixes until clean**

Run: `cd gateway && cargo check` repeatedly, fixing errors.

Expected final state: Compiles cleanly with `cargo check`.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/app.rs gateway/src/main.rs
git commit -m "feat(gateway): app assembly with router, middleware stacking, chat handler pipeline"
```

---

### Task 10: Integration Test — Full Chat Pipeline (M1)

**Files:**
- Create: `gateway/tests/common/mod.rs`
- Create: `gateway/tests/integration/e2e_chat.rs`

- [ ] **Step 1: Create `gateway/tests/common/mod.rs`**

```rust
use std::sync::Arc;
use axum::Router;
use testcontainers::runners::AsyncRunner;
use testcontainers_modules::redis::Redis;

/// Start a Redis testcontainer and return connection URL
pub async fn start_redis() -> String {
    let container = Redis::default().start().await.unwrap();
    let port = container.get_host_port_ipv4(6379).await.unwrap();
    format!("redis://localhost:{}", port)
}

/// Start a mock vLLM server that returns fixed SSE responses
pub async fn start_mock_vllm() -> (String, tokio::task::JoinHandle<()>) {
    let app = Router::new()
        .route("/v1/chat/completions", axum::routing::post(|| async {
            axum::Json(serde_json::json!({
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1234567890,
                "model": "llama-8b",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Hello! How can I help you?"
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 8,
                    "total_tokens": 18
                }
            }))
        }));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Wait for server to be ready
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    (format!("http://{}", addr), handle)
}
```

- [ ] **Step 2: Create `gateway/tests/integration/e2e_chat.rs`**

```rust
mod common;

#[tokio::test]
async fn test_chat_completion_200() {
    // Setup
    let _redis_url = common::start_redis().await;
    let (mock_vllm_url, _handle) = common::start_mock_vllm().await;

    // TODO: Build Gateway with test config pointing to mock_vllm
    // For now, skeleton test — full implementation after app::build supports test config injection
    assert!(true); // Placeholder
}

#[tokio::test]
async fn test_chat_completion_model_not_found_404() {
    // TODO: Test with nonexistent model
    assert!(true);
}

#[tokio::test]
async fn test_chat_completion_unauthorized_401() {
    // TODO: Test without valid API key
    assert!(true);
}
```

- [ ] **Step 3: Verify tests compile and run (placeholder pass)**

Run: `cd gateway && cargo test --test integration`
Expected: Tests compile, placeholders pass.

- [ ] **Step 4: Commit**

```bash
git add gateway/tests/
git commit -m "test(gateway): integration test skeleton with mock vLLM + Redis containers"
```

---

### Task 11: SSE Streaming Proxy (M2)

**Files:**
- Update: `gateway/src/proxy/chat.rs`

- [ ] **Step 1: Add SSE streaming support to `chat.rs`**

Add stream handling function:

```rust
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Handle streaming SSE response from vLLM with cumulative buffer.
/// SSE events may be split across TCP frames — we accumulate in a Vec<u8>,
/// split on \\n\\n, and forward complete events to the client.
/// Usage is extracted from the final event.
pub async fn handle_chat_stream(
    State(state): State<ProxyState>,
    route_info: RouteInfo,
    raw_body: Bytes,
) -> Result<Response, AppError> {
    let upstream_url = format!("http://{}/v1/chat/completions", route_info.pod_address);

    let response = state.http_client
        .post(&upstream_url)
        .header("host", &route_info.pod_address)
        .header("content-type", "application/json")
        .body(raw_body)
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        return Ok(Response::builder()
            .status(status)
            .body(Body::from(body))
            .unwrap());
    }

    let byte_stream = response.bytes_stream();

    // Cumulative buffer for SSE parsing
    let buffer = Arc::new(Mutex::new(Vec::<u8>::new()));
    let usage_received = Arc::new(Mutex::new(false));
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Spawn a background task to consume the upstream byte stream
    tokio::spawn({
        let buffer = buffer.clone();
        let usage_received = usage_received.clone();
        async move {
            let mut byte_stream = byte_stream;
            while let Some(chunk_result) = byte_stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let mut buf = buffer.lock().await;
                        buf.extend_from_slice(&bytes);
                        // Split on double-newline (SSE event boundary)
                        while let Some(pos) = find_sse_boundary(&buf) {
                            let event_bytes = buf.drain(..pos + 2).collect::<Vec<_>>();
                            let event_str = String::from_utf8_lossy(&event_bytes).to_string();
                            // Check for usage in this event
                            if event_str.contains("\"usage\"") {
                                if let Ok(value) = serde_json::from_str::<serde_json::Value>(
                                    event_str.trim()
                                ) {
                                    if value.get("usage").is_some() {
                                        *usage_received.lock().await = true;
                                        tracing::info!("Usage extracted from SSE");
                                    }
                                }
                            }
                            let _ = tx.send(event_str);
                        }
                    }
                    Err(e) => {
                        tracing::error!(?e, "SSE stream error");
                        break;
                    }
                }
            }
            // After stream ends, check if usage was received
            if !*usage_received.lock().await {
                metrics::counter!("gateway_missing_usage_total").increment(1);
                tracing::warn!("SSE stream ended without usage data");
            }
        }
    });

    // Return SSE response to client
    let sse_stream = async_stream::stream! {
        while let Some(event) = rx.recv().await {
            yield Ok(axum::response::sse::Event::default().data(event));
        }
    };

    Ok(Sse::new(sse_stream).into_response())
}

/// Find the index of the first \\n\\n (or \\r\\n\\r\\n) boundary in the buffer.
fn find_sse_boundary(buf: &[u8]) -> Option<usize> {
    buf.windows(2).position(|w| w == b"\n\n")
}
```

- [ ] **Step 2: Update `chat_handler` in `app.rs` to branch on `stream` field**

```rust
if chat_extractor.request.stream {
    return chat::handle_chat_stream(
        State(proxy_state),
        route_info,
        chat_extractor.raw_body,
    ).await;
}
```

- [ ] **Step 3: Run cargo check / fix**

Run: `cd gateway && cargo check`
Expected: Compile, may need `futures` crate. Add `futures = "0.3"` to Cargo.toml.

- [ ] **Step 4: Commit**

```bash
git add gateway/src/proxy/chat.rs gateway/src/app.rs gateway/Cargo.toml
git commit -m "feat(gateway): SSE streaming proxy with usage extraction from final chunk"
```

---

### Task 12: Usage Writer (PG upsert) (M2)

**Files:**
- Create: `gateway/src/proxy/usage_writer.rs`

- [ ] **Step 1: Create `gateway/src/proxy/usage_writer.rs`**

```rust
use sqlx::PgPool;
use uuid::Uuid;
use crate::error::AppError;

#[derive(Debug)]
pub struct UsageEvent {
    pub request_id: String,
    pub api_key_id: String,
    pub user_id: String,
    pub org_id: String,
    pub model_id: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: chrono::DateTime<chrono::Utc>,
    pub status: String,  // "completed" | "cancelled" | "error"
}

pub async fn write_usage(pool: &PgPool, event: UsageEvent) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO raw_usage_events (
            request_id, api_key_id, user_id, org_id, model_id,
            prompt_tokens, completion_tokens, started_at, completed_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (request_id) DO UPDATE SET
            prompt_tokens = EXCLUDED.prompt_tokens,
            completion_tokens = EXCLUDED.completion_tokens,
            completed_at = EXCLUDED.completed_at,
            status = EXCLUDED.status
        "#,
    )
    .bind(&event.request_id)
    .bind(&event.api_key_id)
    .bind(&event.user_id)
    .bind(&event.org_id)
    .bind(&event.model_id)
    .bind(event.prompt_tokens)
    .bind(event.completion_tokens)
    .bind(event.started_at)
    .bind(event.completed_at)
    .bind(&event.status)
    .execute(pool)
    .await
    .map_err(|e| {
        metrics::counter!("gateway_usage_write_errors_total").increment(1);
        tracing::error!(?e, "Failed to write usage event");
        AppError::Internal(format!("Usage write failed: {}", e))
    })?;

    Ok(())
}
```

- [ ] **Step 2: Write unit test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_usage_event_fields() {
        let event = UsageEvent {
            request_id: "req_123".into(),
            api_key_id: "key_abc".into(),
            user_id: "usr_1".into(),
            org_id: "org_1".into(),
            model_id: "llama-8b".into(),
            prompt_tokens: 100,
            completion_tokens: 500,
            started_at: chrono::Utc::now(),
            completed_at: chrono::Utc::now(),
            status: "completed".into(),
        };
        assert_eq!(event.prompt_tokens, 100);
        assert_eq!(event.status, "completed");
    }
}
```

- [ ] **Step 3: Run test**

Run: `cd gateway && cargo test usage_writer::`
Expected: Test passes

- [ ] **Step 4: Wire usage writer into chat proxy**

Update `chat.rs` to call `usage_writer::write_usage()` when usage is extracted from SSE stream or non-stream response. Requires `PgPool` in proxy state.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/proxy/usage_writer.rs gateway/src/proxy/chat.rs
git commit -m "feat(gateway): usage writer with PG upsert for raw_usage_events"
```

---

### Task 13: Graceful Shutdown (M2)

**Files:**
- Create: `gateway/src/shutdown.rs`

- [ ] **Step 1: Create `gateway/src/shutdown.rs`**

```rust
use std::time::Duration;
use tokio::signal;

pub async fn graceful_shutdown(drain_secs: u64) {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received, draining connections for {}s...", drain_secs);

    // Give existing connections time to complete
    // Note: axum::serve().with_graceful_shutdown() handles connection draining.
    // This sleep is for in-flight billing writes and log flushes.
    tokio::time::sleep(Duration::from_secs(drain_secs)).await;

    tracing::info!("Shutdown complete");
}
```

- [ ] **Step 2: Update `main.rs` to use shutdown module**

Replace the inline shutdown with `shutdown::graceful_shutdown(config.shutdown_drain_secs)`.

- [ ] **Step 3: Commit**

```bash
git add gateway/src/shutdown.rs gateway/src/main.rs
git commit -m "feat(gateway): graceful shutdown with drain timeout"
```

---

### Task 14: Integration Tests — Full Suite (M2-M3)

**Files:**
- Update: `gateway/tests/integration/*.rs`

- [ ] **Step 1: Fill in `e2e_chat.rs` with real test**

Test: Start Gateway with mock vLLM, send chat request, assert 200 + usage.

- [ ] **Step 2: Add `e2e_admin.rs`**

Test: Start Gateway with mock Console API, send GET/POST/DELETE, assert proxied.

- [ ] **Step 3: Add `auth.rs` integration test**

Test: Invalid key → 401. Revoked key → 401. Valid key → pass.

- [ ] **Step 4: Add `rate_limit.rs` integration test**

Test: Send requests until 429. Verify sliding window resets.

- [ ] **Step 5: Add header stripping test**

Test: Client sends X-User-Id: "attacker" → mock backend receives Gateway's injected value, not "attacker".

- [ ] **Step 6: Run full integration suite**

Run: `cd gateway && cargo test --test integration`
Expected: All integration tests pass.

- [ ] **Step 7: Commit**

```bash
git add gateway/tests/
git commit -m "test(gateway): full integration test suite (chat, admin, auth, rate limit, header stripping)"
```

---

### Task 15: Cold Start Queuing (M3)

**Files:**
- Update: `gateway/src/route/resolver.rs`
- Create: `gateway/src/cold_start.rs`

- [ ] **Step 1: Create cold start queue module**

When `resolve()` finds an empty pool, instead of returning 503, enter a queue:
1. Register request in per-model wait queue
2. Trigger KAI Scheduler via API call to allocate GPU + start Pod
3. Wait for model ready (poll or callback)
4. Dequeue request and proceed

- [ ] **Step 2: Integrate with route resolver**

Update `resolve()` to call cold start queue when pool is empty.

- [ ] **Step 3: Write integration test with mock KAI Scheduler**

- [ ] **Step 4: Commit**

```bash
git add gateway/src/cold_start.rs gateway/src/route/resolver.rs
git commit -m "feat(gateway): cold start queuing with KAI Scheduler trigger (M3)"
```

---

### Task 16: Documentation + Final Polish (M3)

**Files:**
- Create: `gateway/README.md`

- [ ] **Step 1: Write `gateway/README.md`** with deployment instructions, env vars, health check endpoints, local dev setup

- [ ] **Step 2: Verify all tests pass**

Run: `cd gateway && cargo test`
Expected: All unit + integration tests green.

- [ ] **Step 3: Run `cargo clippy` and fix warnings**

Run: `cd gateway && cargo clippy -- -D warnings`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add gateway/README.md
git commit -m "docs(gateway): README with deployment and local dev instructions"
```
