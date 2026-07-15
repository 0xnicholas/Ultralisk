use std::collections::HashMap;
use base64::Engine as _;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use metrics::{counter, histogram};
use redis::aio::MultiplexedConnection;
use tokio::sync::{Mutex, oneshot};

use crate::config::AppConfig;
use crate::error::AppError;
use crate::types::{AuthResult, RouteInfo};
use crate::proxy::chat::{self, ProxyState};

const FLUSH_CONCURRENCY: usize = 32;

struct BatchSlot {
    requests: Vec<BatchEntry>,
}

struct BatchEntry {
    raw_body: Bytes,
    auth: AuthResult,
    route: RouteInfo,
    request_id: String,
    started_at: chrono::DateTime<chrono::Utc>,
    tx: oneshot::Sender<Result<axum::response::Response, AppError>>,
}

pub struct BatchAggregator {
    slots: Mutex<HashMap<String, BatchSlot>>,
    window_duration: Duration,
    max_requests: usize,
    proxy_state: ProxyState,
    pg_pool: Option<sqlx::PgPool>,
    redis: MultiplexedConnection,
    instance_id: String,
    internal_port: u16,
}

impl BatchAggregator {
    pub fn new(
        config: &AppConfig,
        proxy_state: ProxyState,
        pg_pool: Option<sqlx::PgPool>,
        redis: MultiplexedConnection,
    ) -> Arc<Self> {
        Arc::new(Self {
            slots: Mutex::new(HashMap::new()),
            window_duration: Duration::from_secs(config.batch_window_secs),
            max_requests: config.batch_max_requests,
            proxy_state,
            pg_pool,
            redis,
            instance_id: config.batch_instance_id.clone(),
            internal_port: config.batch_internal_port,
        })
    }

    fn lease_key(model_id: &str) -> String {
        format!("batch:lease:{}", model_id)
    }

    /// Try to acquire the batch ownership lease for a model.
    /// Returns the owner instance_id (either us or another instance).
    async fn acquire_lease(&self, model_id: &str) -> Result<String, AppError> {
        let key = Self::lease_key(model_id);
        let ttl = self.window_duration.as_secs() + 5; // window + buffer

        let result: redis::RedisResult<Option<String>> = redis::cmd("SET")
            .arg(&key)
            .arg(&self.instance_id)
            .arg("NX")
            .arg("EX")
            .arg(ttl)
            .query_async(&mut self.redis.clone())
            .await;

        match result {
            Ok(Some(_)) => {
                // We acquired the lease — return our own id
                Ok(self.instance_id.clone())
            }
            Ok(None) => {
                // Lease already held — read the owner
                let owner: Option<String> = redis::cmd("GET")
                    .arg(&key)
                    .query_async(&mut self.redis.clone())
                    .await
                    .unwrap_or(None);
                Ok(owner.unwrap_or_else(|| self.instance_id.clone()))
            }
            Err(e) => {
                // Redis unavailable — fall back to local processing
                tracing::warn!(error = %e, model_id = %model_id, "Redis lease acquisition failed, falling back to local");
                Ok(self.instance_id.clone())
            }
        }
    }

    pub async fn enqueue(
        self: &Arc<Self>,
        route: RouteInfo,
        auth: AuthResult,
        raw_body: Bytes,
        request_id: String,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<axum::response::Response, AppError> {
        let model_id = route.model_id.clone();
        let pool_name = route.pool_name.clone();

        // Multi-instance coordination: acquire lease for this model
        let owner = self.acquire_lease(&model_id).await?;

        if owner != self.instance_id {
            // We are NOT the owner — forward to the owning instance
            counter!("gateway_batch_forwarded_total", "model" => model_id.clone()).increment(1);
            return self.forward_to_owner(&owner, &route, &auth, raw_body, &request_id, started_at).await;
        }

        // We ARE the owner — enqueue locally
        let (tx, rx) = oneshot::channel();
        let entry = BatchEntry { raw_body, auth, route, request_id, started_at, tx };

        let is_first = {
            let mut slots = self.slots.lock().await;
            let slot = slots.entry(model_id.clone()).or_insert_with(|| BatchSlot {
                requests: Vec::new(),
            });
            let is_first = slot.requests.is_empty();
            slot.requests.push(entry);
            is_first
        };

        counter!("gateway_batch_enqueued_total", "model" => model_id.clone(), "pool" => pool_name.clone()).increment(1);

        if is_first {
            let this = self.clone();
            let model_id_c = model_id.clone();
            let pool_name_c = pool_name.clone();
            let window = self.window_duration;
            tokio::spawn(async move {
                tokio::time::sleep(window).await;
                this.flush(&model_id_c, &pool_name_c).await;
            });

            tracing::info!(
                model_id = %model_id,
                pool = %pool_name,
                window_secs = window.as_secs(),
                "Batch window opened (owner)"
            );
        }

        rx.await.map_err(|_| AppError::Internal("Batch sender dropped".into()))?
    }

    /// Forward a batch request to the owning instance's internal endpoint.
    async fn forward_to_owner(
        &self,
        owner: &str,
        route: &RouteInfo,
        auth: &AuthResult,
        raw_body: Bytes,
        request_id: &str,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<axum::response::Response, AppError> {
        let owner_url = Self::owner_url(owner, self.internal_port);

        let forward_body = serde_json::json!({
            "raw_body": base64::engine::general_purpose::STANDARD.encode(&raw_body),
            "auth": {
                "api_key_id": auth.api_key_id,
                "org_id": auth.org_id,
                "user_id": auth.user_id,
                "quota_limits": auth.quota_limits,
            },
            "route": {
                "model_id": route.model_id,
                "pool_name": route.pool_name,
                "pod_address": route.pod_address,
                "strategy": route.strategy,
            },
            "request_id": request_id,
            "started_at": started_at.to_rfc3339(),
        });

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/v1/internal/batch/enqueue", owner_url))
            .json(&forward_body)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Batch forward failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Batch forward returned {}: {}",
                status.as_u16(),
                body
            )));
        }

        let body_bytes = resp.bytes().await.map_err(|e| {
            AppError::Internal(format!("Failed to read forward response: {}", e))
        })?;

        Ok(axum::response::Response::builder()
            .status(axum::http::StatusCode::OK)
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body_bytes))
            .unwrap())
    }

    fn owner_url(owner: &str, internal_port: u16) -> String {
        // owner is "hostname:public_port" — extract hostname and use internal_port
        let host = owner.split(':').next().unwrap_or("localhost");
        format!("http://{}:{}", host, internal_port)
    }

    /// Internal handler: accept forwarded batch requests from non-owning instances.
    /// This is called by other Gateway instances via /v1/internal/batch/enqueue.
    pub async fn handle_internal_enqueue(
        self: &Arc<Self>,
        body: serde_json::Value,
    ) -> Result<axum::response::Response, AppError> {
        let raw_body_b64 = body["raw_body"].as_str()
            .ok_or_else(|| AppError::Internal("Missing raw_body".into()))?;
        let raw_body = Bytes::from(
            base64::engine::general_purpose::STANDARD.decode(raw_body_b64)
                .map_err(|e| AppError::Internal(format!("Base64 decode failed: {}", e)))?,
        );

        let auth = AuthResult {
            api_key_id: body["auth"]["api_key_id"].as_str().unwrap_or("").to_string(),
            org_id: body["auth"]["org_id"].as_str().unwrap_or("").to_string(),
            user_id: body["auth"]["user_id"].as_str().unwrap_or("").to_string(),
            quota_limits: {
                let mut map = HashMap::new();
                if let Some(ql) = body["auth"]["quota_limits"].as_object() {
                    for (k, v) in ql {
                        if let Some(n) = v.as_u64() {
                            map.insert(k.clone(), n);
                        }
                    }
                }
                map
            },
        };

        let route = RouteInfo {
            model_id: body["route"]["model_id"].as_str().unwrap_or("").to_string(),
            pool_name: body["route"]["pool_name"].as_str().unwrap_or("").to_string(),
            pod_address: body["route"]["pod_address"].as_str().unwrap_or("").to_string(),
            strategy: body["route"]["strategy"].as_str().unwrap_or("serverless").to_string(),
        };

        let request_id = body["request_id"].as_str().unwrap_or("").to_string();
        let started_at = body["started_at"].as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(chrono::Utc::now);

        // Process as if local batch request
        self.enqueue(route, auth, raw_body, request_id, started_at).await
    }

    async fn flush(self: &Arc<Self>, model_id: &str, pool_name: &str) {
        let entries = {
            let mut slots = self.slots.lock().await;
            slots.remove(model_id).map(|s| s.requests).unwrap_or_default()
        };

        // Release the lease after draining — allows another instance to take over next window
        let _: Result<(), _> = redis::cmd("DEL")
            .arg(Self::lease_key(model_id))
            .query_async(&mut self.redis.clone())
            .await;

        if entries.is_empty() {
            return;
        }

        let batch_size = entries.len();
        let flush_start = std::time::Instant::now();

        tracing::info!(
            model_id = %model_id,
            pool = %pool_name,
            batch_size = batch_size,
            "Batch window closed, flushing"
        );

        counter!("gateway_batch_flush_total", "model" => model_id.to_string(), "pool" => pool_name.to_string()).increment(1);
        histogram!("gateway_batch_size", "model" => model_id.to_string()).record(batch_size as f64);

        let semaphore = Arc::new(tokio::sync::Semaphore::new(FLUSH_CONCURRENCY));
        let mut handles = Vec::with_capacity(entries.len());

        for entry in entries {
            let sem = semaphore.clone();
            let proxy = self.proxy_state.clone();
            let pg = self.pg_pool.clone();
            let model = model_id.to_string();
            let pool = pool_name.to_string();

            let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await;

                let result = if entry.route.strategy == "batch" {
                    chat::handle_chat_stream(
                        &proxy, &entry.auth, &entry.route, entry.raw_body,
                        &entry.request_id, entry.started_at, pg,
                    ).await
                } else {
                    chat::handle_chat(
                        &proxy, &entry.auth, &entry.route, entry.raw_body,
                        &entry.request_id, entry.started_at, pg,
                    ).await
                };

                match &result {
                    Ok(_) => {
                        counter!("gateway_batch_request_success_total",
                            "model" => model.clone(), "pool" => pool.clone()
                        ).increment(1);
                    }
                    Err(e) => {
                        counter!("gateway_batch_request_error_total",
                            "model" => model.clone(), "pool" => pool.clone(),
                            "error" => e.to_string()
                        ).increment(1);
                    }
                }

                let _ = entry.tx.send(result);
            });
            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await;
        }

        histogram!("gateway_batch_flush_duration_seconds",
            "model" => model_id.to_string(), "pool" => pool_name.to_string()
        ).record(flush_start.elapsed().as_secs_f64());

        tracing::info!(
            model_id = %model_id,
            pool = %pool_name,
            batch_size = batch_size,
            duration_ms = %flush_start.elapsed().as_millis(),
            "Batch flush complete"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_lease_key_format() {
        assert_eq!(BatchAggregator::lease_key("llama-8b"), "batch:lease:llama-8b");
    }

    #[tokio::test]
    async fn test_owner_url() {
        let url = BatchAggregator::owner_url("host.example.com:8080", 8081);
        assert_eq!(url, "http://host.example.com:8081");
    }
}
