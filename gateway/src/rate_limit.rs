use std::time::{SystemTime, UNIX_EPOCH};

use redis::aio::MultiplexedConnection;

use crate::error::AppError;

const DEFAULT_QUOTA: u64 = 50_000;

/// Check rate limit for (api_key_id, model) using Redis sorted set sliding window.
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
    let members: Vec<String> = redis::cmd("ZRANGEBYSCORE")
        .arg(&key)
        .arg(window_start)
        .arg("+inf")
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis ZRANGEBYSCORE: {}", e)))?;

    let total: u64 = members
        .iter()
        .filter_map(|member| member.split(':').nth(1).and_then(|t| t.parse::<u64>().ok()))
        .sum();

    // 3. Check and record
    if total + estimated_tokens > limit {
        return Err(AppError::RateLimitExceeded {
            retry_after: window_secs,
        });
    }

    let member = format!("{}:{}", now_ms, estimated_tokens);
    redis::cmd("ZADD")
        .arg(&key)
        .arg(now_ms)
        .arg(&member)
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis ZADD: {}", e)))?;

    redis::cmd("EXPIRE")
        .arg(&key)
        .arg(window_secs * 2)
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis EXPIRE: {}", e)))?;

    Ok(())
}

/// Estimate token count before inference. Phase 1: chars/4 + max_tokens.
pub fn estimate_tokens(input_text: &str, max_tokens: u32) -> u64 {
    (input_text.chars().count() as u64 / 4) + max_tokens as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens_short() {
        assert_eq!(estimate_tokens("hello world", 100), 11 / 4 + 100);
    }

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens("", 256), 256);
    }

    #[test]
    fn test_estimate_tokens_long() {
        let long = "a".repeat(1000);
        assert_eq!(estimate_tokens(&long, 500), 1000 / 4 + 500);
    }
}
