use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use axum::{extract::State, Json};
use serde::Deserialize;
use uuid::Uuid;
use crate::auth::jwt;
use crate::db::users;
use crate::error::AppError;
use sha2::{Sha256, Digest};

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(serde::Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

#[derive(Clone)]
pub struct RefreshEntry {
    pub user_id: Uuid,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

pub type RefreshTokenStore = Arc<Mutex<HashMap<String, RefreshEntry>>>;

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn create_refresh_token(store: &RefreshTokenStore, user_id: &Uuid) -> String {
    let token = format!("r_{}", Uuid::now_v7().to_string().replace("-", ""));
    let hash = hash_token(&token);
    let entry = RefreshEntry {
        user_id: *user_id,
        expires_at: chrono::Utc::now() + chrono::Duration::days(30),
    };
    store.lock().unwrap().insert(hash, entry);
    token
}

pub async fn handler(
    State(pool): State<sqlx::PgPool>,
    State(refresh_tokens): State<RefreshTokenStore>,
    State(jwt_secret): State<String>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<RefreshResponse>, AppError> {
    let hash = hash_token(&req.refresh_token);

    let entry = {
        let store = refresh_tokens.lock().unwrap();
        store.get(&hash).cloned()
    }.ok_or(AppError::InvalidToken)?;

    if entry.expires_at < chrono::Utc::now() {
        refresh_tokens.lock().unwrap().remove(&hash);
        return Err(AppError::InvalidToken);
    }

    let user = users::find_by_id(&pool, &entry.user_id).await?
        .ok_or(AppError::InvalidToken)?;

    // Rotate: remove old, create new
    refresh_tokens.lock().unwrap().remove(&hash);
    let new_refresh = create_refresh_token(&refresh_tokens, &entry.user_id);

    let access_token = jwt::create_access_token(
        &user.id.to_string(), &user.org_id.to_string(), &user.role, &jwt_secret,
    )?;

    Ok(Json(RefreshResponse {
        access_token,
        refresh_token: new_refresh,
        expires_in: 3600,
    }))
}
