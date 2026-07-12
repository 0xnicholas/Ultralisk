use crate::error::AppError;
use sqlx::PgPool;

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
    pub status: String, // "completed" | "cancelled" | "error"
}

/// Write a raw usage event to PostgreSQL.
/// Uses upsert semantics: if request_id already exists, update token counts and status.
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

/// Spawn an async task to write usage — non-blocking, best-effort.
/// The response has already been sent to the client, so we don't block on DB writes.
pub fn spawn_usage_write(
    pool: Option<sqlx::PgPool>,
    request_id: String,
    api_key_id: String,
    user_id: String,
    org_id: String,
    model_id: String,
    prompt_tokens: u64,
    completion_tokens: u64,
    started_at: chrono::DateTime<chrono::Utc>,
    status: &str,
) {
    if let Some(pool) = pool {
        let event = UsageEvent {
            request_id,
            api_key_id,
            user_id,
            org_id,
            model_id,
            prompt_tokens: prompt_tokens as i64,
            completion_tokens: completion_tokens as i64,
            started_at,
            completed_at: chrono::Utc::now(),
            status: status.to_string(),
        };
        tokio::spawn(async move {
            if let Err(e) = write_usage(&pool, event).await {
                tracing::error!(?e, "Background usage write failed");
            }
        });
    } else {
        tracing::warn!(
            prompt_tokens,
            completion_tokens,
            "No PgPool configured, usage event dropped"
        );
    }
}

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
        assert_eq!(event.completion_tokens, 500);
        assert_eq!(event.status, "completed");
    }
}
