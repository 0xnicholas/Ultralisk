# Auth Service Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a working Rust Auth Service that validates API Keys (for Gateway), handles login/refresh (for Console UI), and manages API Key lifecycle.

**Architecture:** Single axum binary. PostgreSQL via sqlx. argon2 for passwords, SHA-256 for API keys, jsonwebtoken for JWT. Handler modules per endpoint. In-memory refresh_token store.

**Tech Stack:** Rust 1.85+, axum 0.8, sqlx (PostgreSQL), argon2, jsonwebtoken, sha2, uuid, chrono, serde, tracing, metrics.

**Spec:** `docs/superpowers/specs/2026-07-12-auth-service-design.md`

---

## File Map

```
auth-service/
├── Cargo.toml
├── migrations/
│   └── 001_init.sql                    # orgs, users, api_keys tables + seed data
├── src/
│   ├── main.rs                         # Entry: config load, DB pool, server start
│   ├── config.rs                       # Env vars: AUTH_PORT, DATABASE_URL, JWT_SECRET
│   ├── app.rs                          # Router assembly
│   ├── error.rs                        # AppError + IntoResponse
│   ├── types.rs                        # User, ApiKey, Org domain types
│   ├── db/
│   │   ├── mod.rs
│   │   ├── users.rs                    # find_by_email, find_by_id
│   │   ├── api_keys.rs                 # find_by_hash, create, revoke, list_by_user
│   │   └── orgs.rs                     # find_by_id
│   ├── handlers/
│   │   ├── mod.rs
│   │   ├── validate_key.rs             # POST /validate-key
│   │   ├── login.rs                    # POST /login + brute force counter
│   │   ├── refresh.rs                  # POST /refresh
│   │   ├── keys.rs                     # POST /keys (create + revoke)
│   │   └── me.rs                       # GET /me
│   └── auth/
│       ├── mod.rs
│       ├── jwt.rs                      # encode, decode, Claims struct
│       ├── password.rs                 # hash, verify (argon2)
│       └── api_key.rs                  # generate (ultr_ + 32 random), hash (SHA-256)
└── tests/
    └── integration/
        └── e2e.rs                      # Full endpoint tests with test DB
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `auth-service/Cargo.toml`
- Create: `auth-service/src/main.rs`
- Create: `auth-service/src/config.rs`
- Create: `auth-service/src/error.rs`
- Create: `auth-service/src/types.rs`

- [ ] **Step 1: Create `auth-service/Cargo.toml`**

```toml
[package]
name = "ultralisk-auth-service"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.6", features = ["cors", "limit"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono"] }
uuid = { version = "1", features = ["v7", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
argon2 = "0.5"
jsonwebtoken = "9"
sha2 = "0.10"
rand = "0.8"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
thiserror = "2"
anyhow = "1"
dashmap = "6"

[dev-dependencies]
axum-test = "16"
testcontainers = "0.23"
testcontainers-modules = { version = "0.11", features = ["postgres"] }
```

- [ ] **Step 2: Create `auth-service/src/config.rs`**

```rust
use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub auth_port: u16,
    pub database_url: String,
    pub jwt_secret: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            auth_port: env::var("AUTH_PORT").unwrap_or_else(|_| "3101".into()).parse().unwrap_or(3101),
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://localhost:5432/ultralisk".into()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-in-production".into()),
        }
    }
}
```

- [ ] **Step 3: Create `auth-service/src/error.rs`**

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid credentials")]
    InvalidCredentials,
    #[error("API key not found")]
    ApiKeyNotFound,
    #[error("API key revoked")]
    ApiKeyRevoked,
    #[error("Invalid or expired token")]
    InvalidToken,
    #[error("Account locked due to too many login attempts")]
    AccountLocked { retry_after_secs: u64 },
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "invalid_credentials"),
            AppError::ApiKeyNotFound => (StatusCode::NOT_FOUND, "api_key_not_found"),
            AppError::ApiKeyRevoked => (StatusCode::OK, "api_key_revoked"),
            AppError::InvalidToken => (StatusCode::UNAUTHORIZED, "invalid_token"),
            AppError::AccountLocked { .. } => (StatusCode::TOO_MANY_REQUESTS, "account_locked"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };

        let body = ErrorBody { error: message.to_string() };
        (status, Json(body)).into_response()
    }
}
```

- [ ] **Step 4: Create `auth-service/src/types.rs`**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: Uuid,
    pub org_id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub display_name: Option<String>,
    pub role: String,  // owner|admin|developer|readonly|billing
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: Uuid,
    pub org_id: Uuid,
    pub key_hash: String,
    pub key_prefix: String,
    pub name: Option<String>,
    pub status: String,  // active|revoked
    pub quota_limits: serde_json::Value,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Org {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Serialize)]
pub struct ValidateKeyResponse {
    pub user_id: String,
    pub org_id: String,
    pub status: String,
    pub quota_limits: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
    pub org: OrgInfo,
}

#[derive(Debug, Serialize)]
pub struct OrgInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
    pub org: OrgInfo,
    pub api_keys: Vec<ApiKeySummary>,
}

#[derive(Debug, Serialize)]
pub struct ApiKeySummary {
    pub id: String,
    pub key_prefix: String,
    pub name: Option<String>,
    pub status: String,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
```

- [ ] **Step 5: Create `auth-service/src/main.rs`**

```rust
mod config;
mod error;
mod types;
mod db;
mod handlers;
mod auth;
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
    tracing::info!("Starting Auth Service on port {}", config.auth_port);

    let app = app::build(config).await?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.auth_port)).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
```

- [ ] **Step 6: `cargo check` — verify compile**

- [ ] **Step 7: Commit**

```bash
git add auth-service/
git commit -m "feat(auth-service): project scaffold with config, types, error"
```

---

### Task 2: Database Migrations + Seed Data

**Files:**
- Create: `auth-service/migrations/001_init.sql`
- Update: `auth-service/src/db/mod.rs`

- [ ] **Step 1: Create migration file with full schema**

```sql
-- 001_init.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE orgs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(255),
    role            VARCHAR(50) NOT NULL DEFAULT 'developer',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    key_hash        VARCHAR(64) NOT NULL UNIQUE,
    key_prefix      VARCHAR(10) NOT NULL,
    name            VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    quota_limits    JSONB DEFAULT '{}',
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Seed data: test org + user (password: "test123")
INSERT INTO orgs (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'Test Org', 'test-org');
-- argon2id hash of "test123" (pre-computed)
INSERT INTO users (id, org_id, email, password_hash, display_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'test@ultralisk.dev',
        '$argon2id$v=19$m=19456,t=2,p=1$test_salt_placeholder$test_hash_placeholder',
        'Test User', 'admin');
```

> **Note**: The password hash placeholder must be replaced with a real argon2id hash of "test123". Use `cargo test` helper or `argon2` CLI to generate. Write a small binary or test that prints the hash.

- [ ] **Step 2: Create DB module helpers in `db/mod.rs`**

```rust
use sqlx::PgPool;

pub mod users;
pub mod api_keys;
pub mod orgs;

/// Run migrations from the migrations/ directory
pub async fn migrate(pool: &PgPool) -> anyhow::Result<()> {
    let sql = include_str!("../../migrations/001_init.sql");
    sqlx::query(sql).execute(pool).await?;
    tracing::info!("Database migrations applied");
    Ok(())
}
```

- [ ] **Step 3: Write a test that generates the real argon2 hash for seed data**

```rust
#[test]
fn generate_seed_password_hash() {
    use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
    let password = b"test123";
    let salt = SaltString::generate(&mut rand::thread_rng());
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password, &salt).unwrap().to_string();
    println!("argon2 hash for 'test123': {}", hash);
}
```

Run: `cargo test generate_seed_password_hash -- --nocapture` → copy hash into migration.

- [ ] **Step 4: Commit**

```bash
git add auth-service/migrations/ auth-service/src/db/
git commit -m "feat(auth-service): database migrations + seed data"
```

---

### Task 3: Auth Helpers (JWT, Password, API Key)

**Files:**
- Create: `auth-service/src/auth/mod.rs`
- Create: `auth-service/src/auth/jwt.rs`
- Create: `auth-service/src/auth/password.rs`
- Create: `auth-service/src/auth/api_key.rs`

- [ ] **Step 1: `auth/jwt.rs` — JWT encode/decode**

```rust
use chrono::{Utc, Duration};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,       // user_id
    pub org_id: String,
    pub role: String,
    pub iat: usize,
    pub jti: String,       // unique token id
    pub iss: String,       // "ultralisk-auth"
    pub exp: usize,
}

pub fn create_access_token(user_id: &str, org_id: &str, role: &str, secret: &str) -> Result<String, AppError> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id.to_string(),
        org_id: org_id.to_string(),
        role: role.to_string(),
        iat: now.timestamp() as usize,
        jti: Uuid::now_v7().to_string(),
        iss: "ultralisk-auth".into(),
        exp: (now + Duration::hours(1)).timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|e| AppError::Internal(format!("JWT encode: {}", e)))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::default())
        .map(|data| data.claims)
        .map_err(|_| AppError::InvalidToken)
}
```

- [ ] **Step 2: `auth/password.rs` — argon2 hash + verify**

```rust
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand::rngs::OsRng;
use crate::error::AppError;

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("Password hash: {}", e)))
}

pub fn verify_password(hash: &str, password: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("Invalid stored hash: {}", e)))?;
    Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
}
```

- [ ] **Step 3: `auth/api_key.rs` — generate + hash**

```rust
use sha2::{Sha256, Digest};
use rand::Rng;

/// Generate a new API key: "ultr_" + 32 random alphanumeric chars
pub fn generate_key() -> String {
    let random_part: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    format!("ultr_{}", random_part)
}

/// Extract a human-readable prefix (first 9 chars)
pub fn key_prefix(key: &str) -> String {
    key.chars().take(9).collect()
}

/// SHA-256 hash of the full key for storage
pub fn hash_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hex::encode(hasher.finalize())
}
```

> Add `hex = "0.4"` to Cargo.toml.

- [ ] **Step 4: Unit tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_key_format() {
        let key = generate_key();
        assert!(key.starts_with("ultr_"));
        assert_eq!(key.len(), 37); // "ultr_" + 32 chars
    }

    #[test]
    fn test_hash_key_deterministic() {
        let h1 = hash_key("ultr_test123");
        let h2 = hash_key("ultr_test123");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_password_hash_verify_roundtrip() {
        let hash = hash_password("mysecret").unwrap();
        assert!(verify_password(&hash, "mysecret").unwrap());
        assert!(!verify_password(&hash, "wrong").unwrap());
    }

    #[test]
    fn test_jwt_roundtrip() {
        let token = create_access_token("usr_1", "org_1", "admin", "secret").unwrap();
        let claims = verify_token(&token, "secret").unwrap();
        assert_eq!(claims.sub, "usr_1");
        assert_eq!(claims.org_id, "org_1");
        assert_eq!(claims.role, "admin");
        assert_eq!(claims.iss, "ultralisk-auth");
    }
}
```

- [ ] **Step 5: Run tests** — `cargo test auth::`

- [ ] **Step 6: Commit**

```bash
git add auth-service/src/auth/ auth-service/Cargo.toml
git commit -m "feat(auth-service): JWT, password hashing, API key generation helpers"
```

---

### Task 4: DB Query Modules

**Files:**
- Create: `auth-service/src/db/users.rs`
- Create: `auth-service/src/db/api_keys.rs`
- Create: `auth-service/src/db/orgs.rs`

- [ ] **Step 1: `db/users.rs`**

```rust
use sqlx::PgPool;
use crate::types::User;
use crate::error::AppError;

pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, AppError> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}

pub async fn find_by_id(pool: &PgPool, id: &uuid::Uuid) -> Result<Option<User>, AppError> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}
```

- [ ] **Step 2: `db/api_keys.rs`**

```rust
use sqlx::PgPool;
use crate::types::ApiKey;
use crate::error::AppError;

pub async fn find_by_hash(pool: &PgPool, hash: &str) -> Result<Option<ApiKey>, AppError> {
    sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys WHERE key_hash = $1")
        .bind(hash)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}

pub async fn create(pool: &PgPool, user_id: &uuid::Uuid, org_id: &uuid::Uuid, key_hash: &str, key_prefix: &str, name: Option<&str>, quota_limits: &serde_json::Value) -> Result<ApiKey, AppError> {
    sqlx::query_as::<_, ApiKey>(
        "INSERT INTO api_keys (user_id, org_id, key_hash, key_prefix, name, quota_limits) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
    )
    .bind(user_id).bind(org_id).bind(key_hash).bind(key_prefix).bind(name).bind(quota_limits)
    .fetch_one(pool).await
    .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}

pub async fn revoke(pool: &PgPool, key_id: &uuid::Uuid) -> Result<(), AppError> {
    sqlx::query("UPDATE api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1")
        .bind(key_id).execute(pool).await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))?;
    Ok(())
}

pub async fn update_last_used(pool: &PgPool, key_id: &uuid::Uuid) -> Result<(), AppError> {
    sqlx::query("UPDATE api_keys SET last_used_at = now() WHERE id = $1")
        .bind(key_id).execute(pool).await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))?;
    Ok(())
}

pub async fn list_by_user(pool: &PgPool, user_id: &uuid::Uuid) -> Result<Vec<ApiKey>, AppError> {
    sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC")
        .bind(user_id).fetch_all(pool).await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}
```

- [ ] **Step 3: `db/orgs.rs`**

```rust
use sqlx::PgPool;
use crate::types::Org;
use crate::error::AppError;

pub async fn find_by_id(pool: &PgPool, id: &uuid::Uuid) -> Result<Option<Org>, AppError> {
    sqlx::query_as::<_, Org>("SELECT * FROM orgs WHERE id = $1")
        .bind(id).fetch_optional(pool).await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}
```

- [ ] **Step 4: `cargo check`**

- [ ] **Step 5: Commit**

```bash
git add auth-service/src/db/
git commit -m "feat(auth-service): DB query modules for users, api_keys, orgs"
```

---

### Task 5: Handlers

**Files:**
- Create: `auth-service/src/handlers/mod.rs`
- Create: `auth-service/src/handlers/validate_key.rs`
- Create: `auth-service/src/handlers/login.rs`
- Create: `auth-service/src/handlers/refresh.rs`
- Create: `auth-service/src/handlers/keys.rs`
- Create: `auth-service/src/handlers/me.rs`

- [ ] **Step 1: `handlers/validate_key.rs`** — POST /validate-key

```rust
use axum::{extract::State, Json};
use serde::Deserialize;
use sqlx::PgPool;
use crate::auth::api_key;
use crate::db::api_keys;
use crate::error::AppError;
use crate::types::ValidateKeyResponse;

#[derive(Deserialize)]
pub struct ValidateKeyRequest {
    pub api_key: String,
}

pub async fn handler(
    State(pool): State<PgPool>,
    Json(req): Json<ValidateKeyRequest>,
) -> Result<Json<ValidateKeyResponse>, AppError> {
    let hash = api_key::hash_key(&req.api_key);
    let key = api_keys::find_by_hash(&pool, &hash).await?
        .ok_or(AppError::ApiKeyNotFound)?;

    if key.status == "revoked" {
        return Ok(Json(ValidateKeyResponse {
            user_id: String::new(), org_id: String::new(),
            status: "revoked".into(), quota_limits: serde_json::json!({}),
        }));
    }

    // Update last_used_at (fire-and-forget)
    let pool2 = pool.clone();
    let key_id = key.id;
    tokio::spawn(async move { let _ = api_keys::update_last_used(&pool2, &key_id).await; });

    Ok(Json(ValidateKeyResponse {
        user_id: key.user_id.to_string(),
        org_id: key.org_id.to_string(),
        status: "active".into(),
        quota_limits: key.quota_limits,
    }))
}
```

- [ ] **Step 2: `handlers/login.rs`** — POST /login with brute force protection

Key logic:
1. Parse email + password from body
2. Check per-email brute force counter (DashMap<String, (failures: u32, locked_until: Instant)>)
3. If locked → 429 AccountLocked
4. Look up user by email → not found → increment counter → 401
5. Verify password → fail → increment counter → 401
6. Success → clear counter → generate JWT + refresh_token → return

- [ ] **Step 3: `handlers/refresh.rs`** — POST /refresh

Key logic:
1. Parse refresh_token from body
2. SHA-256 hash → lookup in memory HashMap
3. If not found or expired → 401
4. Generate new JWT + new refresh_token (rotate old one out)
5. Return new JWT

- [ ] **Step 4: `handlers/keys.rs`** — POST /keys with JWT auth middleware

Key logic:
1. Extract JWT from Authorization: Bearer header → verify → get user_id
2. Parse action from body: "create" → generate key + hash + store in DB → return plaintext
3. "revoke" → update status to 'revoked' in DB

- [ ] **Step 5: `handlers/me.rs`** — GET /me with JWT auth middleware

Key logic:
1. Extract JWT → verify → get user_id
2. Look up user + org + api_keys from DB
3. Return MeResponse

- [ ] **Step 6: `handlers/mod.rs`** — re-export all handlers

- [ ] **Step 7: `cargo check`** — fix compile errors

- [ ] **Step 8: Commit**

```bash
git add auth-service/src/handlers/
git commit -m "feat(auth-service): all handlers — validate_key, login, refresh, keys, me"
```

---

### Task 6: App Assembly

**Files:**
- Create: `auth-service/src/app.rs`

- [ ] **Step 1: `app.rs`** — Router + state

```rust
use axum::{Router, routing::{get, post}};
use sqlx::PgPool;
use tower_http::limit::RequestBodyLimitLayer;
use crate::config::AppConfig;
use crate::handlers;

pub async fn build(config: AppConfig) -> anyhow::Result<Router> {
    let pool = PgPool::connect(&config.database_url).await?;
    crate::db::migrate(&pool).await?;

    // Prometheus metrics
    let recorder = metrics_exporter_prometheus::PrometheusBuilder::new().build_recorder();
    let metrics_handle = recorder.handle();
    metrics::set_global_recorder(recorder).unwrap();

    let app = Router::new()
        .route("/validate-key", post(handlers::validate_key::handler))
        .route("/login", post(handlers::login::handler))
        .route("/refresh", post(handlers::refresh::handler))
        .route("/keys", post(handlers::keys::handler))
        .route("/me", get(handlers::me::handler))
        .route("/health", get(|| async { "OK" }))
        .route("/metrics", get(move || {
            let handle = metrics_handle.clone();
            async move { handle.render() }
        }))
        .with_state(pool)
        .layer(RequestBodyLimitLayer::new(10 * 1024)); // 10KB

    Ok(app)
}
```

- [ ] **Step 2: $5.3-memory:** Add the refresh_token HashMap + brute force counter as shared state (wrap in `Arc<AppState>` and add to Router)

- [ ] **Step 3: `cargo run`** — verify server starts, /health returns OK

- [ ] **Step 4: Test with curl**

```bash
# Start PG locally or via Docker
docker run -d --name pg -e POSTGRES_DB=ultralisk -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16

# Start Auth Service
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultralisk
cargo run

# Test health
curl http://localhost:3101/health
# → OK

# Test validate-key (seed key)
curl -X POST http://localhost:3101/validate-key -H 'Content-Type: application/json' -d '{"api_key":"ultr_test123"}'
```

- [ ] **Step 5: Commit**

```bash
git add auth-service/src/app.rs
git commit -m "feat(auth-service): app assembly — router, state, DB pool"
```

---

### Task 7: Integration Tests

**Files:**
- Create: `auth-service/tests/integration/e2e.rs`

- [ ] **Step 1: Write e2e tests with testcontainers (PostgreSQL)**

Tests:
- POST /validate-key with valid key → 200 + active status
- POST /validate-key with invalid key → 404
- POST /validate-key with revoked key → 200 + revoked status
- POST /login with valid credentials → 200 + JWT
- POST /login with wrong password → 401
- POST /login 5 failures → 429 locked
- POST /refresh with valid token → 200 + new JWT
- POST /keys (create) with JWT auth → 200 + plaintext key
- POST /keys (revoke) with JWT auth → 200
- GET /me with JWT auth → 200 + user info

- [ ] **Step 2: Run tests** — `cargo test --test integration` (requires Docker)

- [ ] **Step 3: Commit**

```bash
git add auth-service/tests/
git commit -m "test(auth-service): integration tests with testcontainers"
```
