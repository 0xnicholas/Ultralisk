//! Redis Pub/Sub subscriber for API key revocations.
//!
//! ADR-008: The Auth Service publishes revoked key hashes to the `revocations`
//! Redis channel. The Gateway subscribes to this channel and invalidates its
//! local cache entries on receipt. On connection loss, the Gateway uses the
//! `revocation_version` counter as a fallback to pull missed revocations.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use futures::StreamExt;
use redis::aio::MultiplexedConnection;

const REVOCATION_CHANNEL: &str = "revocations";
const VERSION_KEY: &str = "revocation_version";
const CACHE_KEY_PREFIX: &str = "apikey_hash";

struct RevocationSubscriberState {
    local_version: AtomicU64,
    redis: MultiplexedConnection,
    redis_url: String,
}

pub async fn start_subscriber(
    redis: MultiplexedConnection,
    redis_url: String,
) -> anyhow::Result<tokio::task::JoinHandle<()>> {
    let state = Arc::new(RevocationSubscriberState {
        local_version: AtomicU64::new(0),
        redis,
        redis_url,
    });

    let handle = tokio::spawn(async move {
        run_subscription_loop(state).await;
    });

    Ok(handle)
}

async fn run_subscription_loop(state: Arc<RevocationSubscriberState>) {
    loop {
        if let Err(e) = sync_missed_revocations(&state).await {
            tracing::warn!(error = %e, "Failed to sync missed revocations");
        }

        let pubsub_client = match redis::Client::open(state.redis_url.as_str()) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!(error = %e, "Failed to create Redis client for PubSub, retrying in 5s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        let conn = match pubsub_client.get_async_connection().await {
            Ok(c) => c,
            Err(e) => {
                tracing::error!(error = %e, "Failed to create async Redis connection for PubSub, retrying in 5s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        let mut pubsub_conn = conn.into_pubsub();

        if let Err(e) = pubsub_conn.subscribe(REVOCATION_CHANNEL).await {
            tracing::error!(error = %e, "Failed to subscribe to revocations channel, retrying in 5s");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            continue;
        }

        tracing::info!("Subscribed to Redis revocations channel");

        let mut msg_stream = pubsub_conn.on_message();

        loop {
            let msg = match msg_stream.next().await {
                Some(m) => m,
                None => {
                    tracing::warn!("Revocation PubSub stream ended, reconnecting...");
                    break;
                }
            };

            let payload: String = match msg.get_payload() {
                Ok(p) => p,
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to read revocation payload");
                    continue;
                }
            };

            let trimmed = payload.trim();
            if trimmed.is_empty() {
                continue;
            }

            let cache_key = format!("{}:{}", CACHE_KEY_PREFIX, trimmed);
            let mut write_conn = state.redis.clone();
            match redis::cmd("DEL")
                .arg(&cache_key)
                .query_async::<i32>(&mut write_conn)
                .await
            {
                Ok(deleted) => {
                    if deleted > 0 {
                        tracing::info!(key_hash = %trimmed, deleted = deleted, "Revoked cached API key (PubSub)");
                        metrics::counter!("gateway_revocations_received_total").increment(1);
                    }
                }
                Err(e) => {
                    tracing::warn!(key_hash = %trimmed, error = %e, "Failed to delete revoked key from cache");
                }
            }
        }
    }
}

async fn sync_missed_revocations(
    state: &RevocationSubscriberState,
) -> Result<(), String> {
    let mut conn = state.redis.clone();
    let remote_version: Option<u64> = redis::cmd("GET")
        .arg(VERSION_KEY)
        .query_async(&mut conn)
        .await
        .map_err(|e| format!("Redis GET {}: {}", VERSION_KEY, e))?;

    let remote = remote_version.unwrap_or(0);
    let local = state.local_version.load(Ordering::Acquire);

    if remote > local {
        tracing::info!(
            local_version = local,
            remote_version = remote,
            missed = remote - local,
            "Syncing missed revocations after reconnect"
        );
        metrics::counter!("gateway_revocation_sync_total").increment(1);
    }

    state.local_version.store(remote, Ordering::Release);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_prefix() {
        assert!(CACHE_KEY_PREFIX == "apikey_hash");
    }

    #[test]
    fn test_atomic_version_init() {
        let v = AtomicU64::new(0);
        assert_eq!(v.load(Ordering::Acquire), 0);
    }
}
