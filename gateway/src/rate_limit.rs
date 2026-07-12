use std::time::{SystemTime, UNIX_EPOCH};

use redis::aio::MultiplexedConnection;

use crate::error::AppError;

const DEFAULT_QUOTA: u64 = 50_000;

/// Atomic rate-limit check via Redis Lua script.
/// Eliminates the check-then-act race in the multi-step approach.
const RATE_LIMIT_LUA: &str = r#"
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])
local estimated = tonumber(ARGV[6])

-- 1. Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- 2. Sum tokens in window
local members = redis.call('ZRANGEBYSCORE', key, window_start, '+inf')
local total = 0
for i = 1, #members do
    local _, tokens = members[i]:match("^(%d+):(%d+)$")
    if tokens then
        total = total + tonumber(tokens)
    end
end

-- 3. Check limit
if total + estimated > limit then
    return 0  -- rate limited
end

-- 4. Add current request
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)

return 1  -- allowed
"#;

/// Check rate limit for (api_key_id, model) using an atomic Redis Lua script.
/// Returns Ok(()) if under limit, Err(RateLimitExceeded) if over.
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
        .unwrap_or_default()
        .as_millis() as u64;

    let key = format!("ratelimit:{}:{}:{}", window_secs, api_key_id, model);
    let window_start = now_ms - (window_secs * 1000);
    let member = format!("{}:{}", now_ms, estimated_tokens);
    let ttl = window_secs * 2;

    let mut conn = redis.clone();
    let script = redis::Script::new(RATE_LIMIT_LUA);

    let result: i32 = script
        .key(&key)
        .arg(now_ms)
        .arg(window_start)
        .arg(limit)
        .arg(&member)
        .arg(ttl)
        .arg(estimated_tokens)
        .invoke_async(&mut conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis Lua script error: {}", e)))?;

    match result {
        1 => Ok(()),
        _ => Err(AppError::RateLimitExceeded {
            retry_after: window_secs,
        }),
    }
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
