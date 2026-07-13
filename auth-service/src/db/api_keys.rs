use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;
use crate::types::ApiKey;
use crate::error::AppError;

pub async fn find_by_hash(pool: &PgPool, hash: &str) -> Result<Option<ApiKey>, AppError> {
    sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys WHERE key_hash = $1")
        .bind(hash)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}

pub async fn create(
    pool: &PgPool, user_id: &Uuid, org_id: &Uuid,
    key_hash: &str, key_prefix: &str, name: Option<&str>,
    quota_limits: &serde_json::Value,
) -> Result<ApiKey, AppError> {
    sqlx::query_as::<_, ApiKey>(
        "INSERT INTO api_keys (user_id, org_id, key_hash, key_prefix, name, quota_limits) \
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
    )
    .bind(user_id).bind(org_id).bind(key_hash).bind(key_prefix).bind(name).bind(quota_limits)
    .fetch_one(pool).await
    .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}

pub async fn revoke(pool: &PgPool, key_id: &Uuid) -> Result<String, AppError> {
    let row = sqlx::query(
        "UPDATE api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1 AND status = 'active' RETURNING key_hash"
    )
    .bind(key_id).fetch_optional(pool).await
    .map_err(|e| AppError::Internal(format!("DB error: {}", e)))?;

    match row {
        Some(r) => {
            let hash: String = r.get("key_hash");
            Ok(hash)
        }
        None => Err(AppError::ApiKeyNotFound),
    }
}

pub async fn update_last_used(pool: &PgPool, key_id: &Uuid) -> Result<(), AppError> {
    sqlx::query("UPDATE api_keys SET last_used_at = now() WHERE id = $1")
        .bind(key_id).execute(pool).await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))?;
    Ok(())
}

pub async fn list_by_user(pool: &PgPool, user_id: &Uuid) -> Result<Vec<ApiKey>, AppError> {
    sqlx::query_as::<_, ApiKey>(
        "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(user_id).fetch_all(pool).await
    .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}
