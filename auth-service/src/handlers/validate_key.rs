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

    // Fire-and-forget last_used_at update
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
