//! Cold start queuing for models not currently loaded on any GPU.
//!
//! Phase 1 M3: When a model is not loaded (pool empty), the Gateway queues the
//! request, triggers KAI Scheduler to provision a GPU, then dequeues and
//! processes the request once the model is ready.
//!
//! This module provides the queue infrastructure and KAI Scheduler integration.
//! The KAI Scheduler is an external service that allocates GPU resources.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Notify};
use tracing;

/// A queue of requests waiting for a specific model to become available.
struct ModelQueue {
    /// Number of waiting requests
    waiting: u32,
    /// Notified when the model becomes available
    notify: Arc<Notify>,
}

/// Global cold start queues, keyed by model_id.
pub struct ColdStartQueues {
    queues: Mutex<HashMap<String, ModelQueue>>,
}

impl ColdStartQueues {
    pub fn new() -> Self {
        Self { queues: Mutex::new(HashMap::new()) }
    }

    /// Register a request in the cold start queue for `model_id`.
    /// Returns a `Notify` to await on. The caller should:
    /// 1. Call `enqueue()` to register
    /// 2. Trigger KAI Scheduler externally
    /// 3. `notify.notified().await` to wait for model ready
    /// 4. Re-resolve the route
    pub async fn enqueue(&self, model_id: &str) -> Arc<Notify> {
        let mut queues = self.queues.lock().await;
        let entry = queues
            .entry(model_id.to_string())
            .or_insert_with(|| ModelQueue {
                waiting: 0,
                notify: Arc::new(Notify::new()),
            });
        entry.waiting += 1;
        tracing::info!(
            model_id = %model_id,
            waiting = entry.waiting,
            "Request queued for cold start"
        );
        entry.notify.clone()
    }

    /// Wait for model to become ready, with timeout.
    /// Returns Ok(()) if notified, Err if timed out.
    pub async fn wait_for_ready(
        &self,
        model_id: &str,
        timeout: Duration,
    ) -> Result<(), crate::error::AppError> {
        let notify = self.enqueue(model_id).await;
        tokio::time::timeout(timeout, notify.notified())
            .await
            .map_err(|_| {
                tracing::warn!(
                    model_id = %model_id,
                    timeout_secs = timeout.as_secs(),
                    "Cold start timed out"
                );
                crate::error::AppError::ColdStartTimeout
            })
    }

    /// Notify all waiters that `model_id` is now available.
    pub async fn notify_ready(&self, model_id: &str) {
        let mut queues = self.queues.lock().await;
        if let Some(entry) = queues.get_mut(model_id) {
            let count = entry.waiting;
            entry.waiting = 0;
            entry.notify.notify_waiters();
            tracing::info!(
                model_id = %model_id,
                woken = count,
                "Cold start complete, notified waiters"
            );
        }
    }

    /// Remove queue entry and notify with error if cold start fails
    pub async fn notify_failed(&self, model_id: &str) {
        let mut queues = self.queues.lock().await;
        if let Some(entry) = queues.remove(model_id) {
            entry.notify.notify_waiters();
            tracing::warn!(
                model_id = %model_id,
                "Cold start failed, notified waiters to retry"
            );
        }
    }

    /// Check if a model has waiting requests
    pub async fn has_waiters(&self, model_id: &str) -> bool {
        let queues = self.queues.lock().await;
        queues.get(model_id).map(|q| q.waiting > 0).unwrap_or(false)
    }
}

/// Trigger KAI Scheduler to provision GPU for a model.
/// This calls the KAI Scheduler API to allocate resources.
/// Returns true if the trigger was successful.
pub async fn trigger_kai_provision(
    kai_url: &str,
    model_id: &str,
    gpu_count: u32,
    gpu_type: &str,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build KAI HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/api/v1/provision", kai_url.trim_end_matches('/')))
        .json(&serde_json::json!({
            "model_id": model_id,
            "gpu_count": gpu_count,
            "gpu_type": gpu_type,
        }))
        .send()
        .await
        .map_err(|e| format!("KAI provision request failed: {}", e))?;

    if response.status().is_success() {
        tracing::info!(
            model_id = %model_id,
            gpu_count = gpu_count,
            gpu_type = gpu_type,
            "KAI provision triggered"
        );
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("KAI provision failed: {} {}", status, body))
    }
}

/// Global singleton for cold start queues.
pub static COLD_START_QUEUES: once_cell::sync::Lazy<ColdStartQueues> =
    once_cell::sync::Lazy::new(ColdStartQueues::new);

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_enqueue_and_notify() {
        let queues = ColdStartQueues::new();
        let notify = queues.enqueue("test-model").await;

        let notify_clone = notify.clone();
        let handle = tokio::spawn(async move {
            notify_clone.notified().await;
            "woken"
        });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        queues.notify_ready("test-model").await;

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            handle,
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(result, "woken");
    }

    #[tokio::test]
    async fn test_wait_for_ready_timeout() {
        let queues = ColdStartQueues::new();
        let result = queues
            .wait_for_ready("test-model", Duration::from_millis(50))
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_wait_for_ready_notified() {
        use std::sync::Arc;
        let queues = Arc::new(ColdStartQueues::new());
        let q = queues.clone();
        let model = "test-model".to_string();

        let handle = tokio::spawn(async move {
            q.wait_for_ready(&model, Duration::from_secs(5)).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        queues.notify_ready("test-model").await;

        let result = tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .unwrap()
            .unwrap();
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_failed_cleans_up() {
        let queues = ColdStartQueues::new();
        let _notify = queues.enqueue("test-model").await;
        queues.notify_failed("test-model").await;

        let inner = queues.queues.lock().await;
        assert!(inner.get("test-model").is_none());
    }

    #[tokio::test]
    async fn test_has_waiters() {
        let queues = ColdStartQueues::new();
        assert!(!queues.has_waiters("test-model").await);
        let _notify = queues.enqueue("test-model").await;
        assert!(queues.has_waiters("test-model").await);
        queues.notify_ready("test-model").await;
    }
}
