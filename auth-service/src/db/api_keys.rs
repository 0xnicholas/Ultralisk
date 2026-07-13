use sqlx::PgPool;
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

pub async fn revoke(pool: &PgPool, key_id: &Uuid) -> Result<(), AppError> {
    let rows = sqlx::query(
        "UPDATE api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1 AND status = 'active'"
    )
    .bind(key_id).execute(pool).await
    .map_err(|e| AppError::Internal(format!("DB error: {}", e)))?;
    if rows.rows_affected() == 0 {
        return Err(AppError::ApiKeyNotFound);
    }
    Ok(())
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
