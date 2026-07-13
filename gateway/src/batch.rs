use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use metrics::{counter, histogram};
use tokio::sync::{Mutex, oneshot};

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
}

impl BatchAggregator {
    pub fn new(
        window_secs: u64,
        max_requests: usize,
        proxy_state: ProxyState,
        pg_pool: Option<sqlx::PgPool>,
    ) -> Arc<Self> {
        let agg = Arc::new(Self {
            slots: Mutex::new(HashMap::new()),
            window_duration: Duration::from_secs(window_secs),
            max_requests,
            proxy_state,
            pg_pool,
        });

        agg
    }

    pub async fn enqueue(
        self: &Arc<Self>,
        route: RouteInfo,
        auth: AuthResult,
        raw_body: Bytes,
        request_id: String,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<axum::response::Response, AppError> {
        let (tx, rx) = oneshot::channel();
        let entry = BatchEntry { raw_body, auth, route, request_id, started_at, tx };

        let model_id = entry.route.model_id.clone();
        let pool_name = entry.route.pool_name.clone();
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
            let max_reqs = self.max_requests;
            tokio::spawn(async move {
                tokio::time::sleep(window).await;
                this.flush(&model_id_c, &pool_name_c).await;
            });

            tracing::info!(
                model_id = %model_id,
                pool = %pool_name,
                window_secs = window.as_secs(),
                max_requests = max_reqs,
                "Batch window opened"
            );
        }

        rx.await.map_err(|_| AppError::Internal("Batch sender dropped".into()))?
    }

    async fn flush(self: &Arc<Self>, model_id: &str, pool_name: &str) {
        let entries = {
            let mut slots = self.slots.lock().await;
            slots.remove(model_id).map(|s| s.requests).unwrap_or_default()
        };

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
    async fn test_batch_aggregator_lifecycle() {
        let proxy = ProxyState::new(30);
        let agg = BatchAggregator::new(1, 10, proxy, None);

        // Verify we can create the aggregator
        let model_id = "test-batch-model";
        let mut slots = agg.slots.lock().await;
        assert!(slots.is_empty());
        slots.insert(model_id.to_string(), BatchSlot { requests: Vec::new() });
        assert_eq!(slots.len(), 1);
    }
}
