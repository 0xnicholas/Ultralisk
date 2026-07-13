use std::sync::Arc;
use std::time::Instant;
use axum::{extract::State, Json};
use dashmap::DashMap;
use serde::Deserialize;
use sqlx::PgPool;
use crate::auth::{jwt, password};
use crate::db::users;
use crate::error::AppError;
use crate::types::{LoginResponse, UserInfo, OrgInfo};

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

// Per-email brute force counter: (failures, locked_until)
pub type BruteForceMap = Arc<DashMap<String, (u32, Instant)>>;

pub async fn handler(
    State(pool): State<PgPool>,
    State(brute_force): State<BruteForceMap>,
    State(jwt_secret): State<String>,
    State(refresh_tokens): State<crate::handlers::refresh::RefreshTokenStore>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // Check brute force lock
    if let Some(entry) = brute_force.get(&req.email) {
        let (failures, locked_until) = *entry.value();
        if failures >= 5 && locked_until > Instant::now() {
            let retry = (locked_until - Instant::now()).as_secs();
            return Err(AppError::AccountLocked { retry_after_secs: retry });
        }
    }

    let user = users::find_by_email(&pool, &req.email).await?
        .ok_or_else(|| {
            increment_failures(&brute_force, &req.email);
            AppError::InvalidCredentials
        })?;

    let valid = password::verify_password(&user.password_hash, &req.password).unwrap_or(false);
    if !valid {
        increment_failures(&brute_force, &req.email);
        return Err(AppError::InvalidCredentials);
    }

    // Success — clear counter
    brute_force.remove(&req.email);

    let token = jwt::create_access_token(
        &user.id.to_string(), &user.org_id.to_string(), &user.role, &jwt_secret,
    )?;
    let refresh_token = crate::handlers::refresh::create_refresh_token(&refresh_tokens, &user.id);

    Ok(Json(LoginResponse {
        access_token: token,
        refresh_token,
        expires_in: 3600,
        user: UserInfo {
            id: user.id.to_string(),
            email: user.email,
            display_name: user.display_name,
            role: user.role,
            org: OrgInfo { id: user.org_id.to_string(), name: "Test Org".into() },
        },
    }))
}

fn increment_failures(map: &BruteForceMap, email: &str) {
    map.entry(email.to_string())
        .and_modify(|(count, locked)| {
            *count += 1;
            if *count >= 5 { *locked = Instant::now() + std::time::Duration::from_secs(900); }
        })
        .or_insert((1, Instant::now()));
}
