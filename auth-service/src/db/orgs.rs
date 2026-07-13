use sqlx::PgPool;
use crate::types::Org;
use crate::error::AppError;

pub async fn find_by_id(pool: &PgPool, id: &uuid::Uuid) -> Result<Option<Org>, AppError> {
    sqlx::query_as::<_, Org>("SELECT * FROM orgs WHERE id = $1")
        .bind(id).fetch_optional(pool).await
        .map_err(|e| AppError::Internal(format!("DB error: {}", e)))
}
