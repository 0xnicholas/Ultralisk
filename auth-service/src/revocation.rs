use redis::aio::MultiplexedConnection;

use crate::error::AppError;

const CACHE_KEY_PREFIX: &str = "apikey_hash";
const REVOCATION_CHANNEL: &str = "revocations";
const VERSION_KEY: &str = "revocation_version";

#[derive(Clone)]
pub struct Revocation {
    redis: MultiplexedConnection,
}

impl Revocation {
    pub fn new(redis: MultiplexedConnection) -> Self {
        Self { redis }
    }

    fn cache_key(key_hash: &str) -> String {
        format!("{}:{}", CACHE_KEY_PREFIX, key_hash)
    }

    pub async fn delete_cache(&self, key_hash: &str) -> Result<(), AppError> {
        let mut conn = self.redis.clone();
        let key = Self::cache_key(key_hash);
        redis::cmd("DEL")
            .arg(&key)
            .query_async::<i32>(&mut conn)
            .await
            .map_err(|e| AppError::Internal(format!("Redis DEL error: {}", e)))?;
        tracing::info!(key_hash = %key_hash, "Deleted API key from Redis cache");
        Ok(())
    }

    pub async fn publish_revocation(&self, key_hash: &str) -> Result<(), AppError> {
        let mut conn = self.redis.clone();
        redis::cmd("PUBLISH")
            .arg(REVOCATION_CHANNEL)
            .arg(key_hash)
            .query_async::<i32>(&mut conn)
            .await
            .map_err(|e| AppError::Internal(format!("Redis PUBLISH error: {}", e)))?;
        tracing::info!(key_hash = %key_hash, "Published revocation to Redis channel");
        Ok(())
    }

    pub async fn increment_version(&self) -> Result<u64, AppError> {
        let mut conn = self.redis.clone();
        let version: u64 = redis::cmd("INCR")
            .arg(VERSION_KEY)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Internal(format!("Redis INCR error: {}", e)))?;
        tracing::info!(version = version, "Incremented revocation version");
        Ok(version)
    }

    pub async fn get_version(&self) -> Result<u64, AppError> {
        let mut conn = self.redis.clone();
        let version: Option<u64> = redis::cmd("GET")
            .arg(VERSION_KEY)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Internal(format!("Redis GET error: {}", e)))?;
        Ok(version.unwrap_or(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_format() {
        let key = Revocation::cache_key("abc123");
        assert_eq!(key, "apikey_hash:abc123");
    }
}
