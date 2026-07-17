use axum::{extract::State, http::HeaderMap, Json};
use rand::Rng;
use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::{jwt, totp as totp_auth};
use crate::error::AppError;
use crate::types::LoginResponse;

const SESSION_TTL_SECS: u64 = 300;

fn extract_user_id(headers: &HeaderMap, jwt_secret: &str) -> Result<String, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let data = jsonwebtoken::decode::<serde_json::Value>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .map_err(|_| AppError::InvalidToken)?;

    data.claims
        .get("sub")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or(AppError::InvalidToken)
}

#[derive(Serialize)]
pub struct SetupResponse {
    pub secret: String,
    pub uri: String,
}

#[derive(Deserialize)]
pub struct VerifySetupRequest {
    pub code: String,
    pub secret: String,
}

#[derive(Serialize)]
pub struct VerifySetupResponse {
    pub enabled: bool,
    pub recovery_codes: Vec<String>,
}

#[derive(Deserialize)]
pub struct DisableRequest {
    pub password: String,
}

#[derive(Deserialize)]
pub struct TotpLoginRequest {
    pub session_token: String,
    pub code: String,
}

/// POST /totp/setup
pub async fn setup_handler(
    State(pool): State<PgPool>,
    State(jwt_secret): State<String>,
    headers: HeaderMap,
    Json(_req): Json<serde_json::Value>,
) -> Result<Json<SetupResponse>, AppError> {
    let user_id = extract_user_id(&headers, &jwt_secret)?;
    let uuid = Uuid::parse_str(&user_id).map_err(|_| AppError::Unauthorized)?;

    let email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(uuid)
        .fetch_one(&pool)
        .await
        .map_err(|_| AppError::Unauthorized)?;

    let (uri, secret) = totp_auth::generate_secret(&email);
    Ok(Json(SetupResponse { secret, uri }))
}

/// POST /totp/verify-setup
pub async fn verify_setup_handler(
    State(pool): State<PgPool>,
    State(jwt_secret): State<String>,
    headers: HeaderMap,
    Json(req): Json<VerifySetupRequest>,
) -> Result<Json<VerifySetupResponse>, AppError> {
    let user_id = extract_user_id(&headers, &jwt_secret)?;

    if !totp_auth::verify_code(&req.secret, &req.code) {
        return Err(AppError::InvalidToken);
    }

    let uuid = Uuid::parse_str(&user_id).map_err(|_| AppError::Unauthorized)?;
    sqlx::query("UPDATE users SET totp_secret = $1 WHERE id = $2")
        .bind(&req.secret)
        .bind(uuid)
        .execute(&pool)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut rng = rand::thread_rng();
    let recovery_codes: Vec<String> = (0..3)
        .map(|_| {
            let code: u64 = rng.gen();
            format!("URC-{:016X}", code)
        })
        .collect();

    Ok(Json(VerifySetupResponse { enabled: true, recovery_codes }))
}

/// POST /totp/disable
pub async fn disable_handler(
    State(pool): State<PgPool>,
    State(jwt_secret): State<String>,
    headers: HeaderMap,
    Json(_req): Json<DisableRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = extract_user_id(&headers, &jwt_secret)?;
    let uuid = Uuid::parse_str(&user_id).map_err(|_| AppError::Unauthorized)?;

    sqlx::query("UPDATE users SET totp_secret = NULL WHERE id = $1")
        .bind(uuid)
        .execute(&pool)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({"enabled": false})))
}

/// Create a temporary session token for TOTP login flow.
pub async fn create_totp_session(
    redis: &MultiplexedConnection,
    user_id: &str,
) -> Result<String, AppError> {
    let session_token = Uuid::now_v7().to_string();
    let key = format!("totp:session:{}", session_token);

    let mut conn = redis.clone();
    let _: Result<(), _> = redis::cmd("SET")
        .arg(&key)
        .arg(user_id)
        .arg("EX")
        .arg(SESSION_TTL_SECS)
        .query_async(&mut conn)
        .await;

    Ok(session_token)
}

/// Verify a TOTP session token and return the user_id.
async fn get_session_user(
    redis: &MultiplexedConnection,
    session_token: &str,
) -> Result<String, AppError> {
    let key = format!("totp:session:{}", session_token);
    let mut conn = redis.clone();
    let user_id: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await
        .map_err(|_| AppError::InvalidToken)?;

    match user_id {
        Some(uid) => {
            let mut conn2 = redis.clone();
            let _: Result<(), _> = redis::cmd("DEL")
                .arg(&key)
                .query_async(&mut conn2)
                .await;
            Ok(uid)
        }
        None => Err(AppError::InvalidToken),
    }
}

/// POST /login/totp
pub async fn login_totp_handler(
    State(pool): State<PgPool>,
    State(redis): State<MultiplexedConnection>,
    State(jwt_secret): State<String>,
    State(refresh_tokens): State<crate::handlers::refresh::RefreshTokenStore>,
    Json(req): Json<TotpLoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let user_id = get_session_user(&redis, &req.session_token).await?;
    let uuid = Uuid::parse_str(&user_id).map_err(|_| AppError::InvalidToken)?;

    let totp_secret: Option<String> = sqlx::query_scalar("SELECT totp_secret FROM users WHERE id = $1")
        .bind(uuid)
        .fetch_optional(&pool)
        .await
        .map_err(|_| AppError::InvalidToken)?
        .flatten();

    match totp_secret {
        Some(secret) => {
            if !totp_auth::verify_code(&secret, &req.code) {
                return Err(AppError::InvalidToken);
            }
        }
        None => return Err(AppError::InvalidToken),
    }

    let user = sqlx::query_as::<_, crate::types::User>("SELECT * FROM users WHERE id = $1")
        .bind(uuid)
        .fetch_one(&pool)
        .await
        .map_err(|_| AppError::InvalidToken)?;

    let access_token = jwt::create_access_token(
        &user.id.to_string(), &user.org_id.to_string(), &user.role, &jwt_secret,
    )?;
    let refresh_token = crate::handlers::refresh::create_refresh_token(&refresh_tokens, &user.id);

    Ok(Json(LoginResponse {
        access_token,
        refresh_token,
        expires_in: 3600,
        totp_required: false,
        session_token: None,
        user: crate::types::UserInfo {
            id: user.id.to_string(),
            email: user.email,
            display_name: user.display_name,
            role: user.role,
            org: crate::types::OrgInfo { id: user.org_id.to_string(), name: "Test Org".into() },
        },
    }))
}
