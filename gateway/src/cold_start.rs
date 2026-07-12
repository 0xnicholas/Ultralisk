//! Cold start queuing for models not currently loaded on any GPU.
//!
//! Phase 1 M3: When a model is not loaded (pool empty), instead of returning
//! 503, the Gateway queues the request, triggers KAI Scheduler to provision a
//! GPU, then dequeues and processes the request once the model is ready.
//!
//! This module provides the queue infrastructure. Integration with KAI Scheduler
//! requires a running KAI deployment. Until then, the default behavior is 503.

use std::collections::HashMap;
use std::sync::Arc;
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

        // Notify should wake the waiter
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
    async fn test_failed_cleans_up() {
        let queues = ColdStartQueues::new();
        let _notify = queues.enqueue("test-model").await;
        queues.notify_failed("test-model").await;

        // Queue should be removed
        let inner = queues.queues.lock().await;
        assert!(inner.get("test-model").is_none());
    }
}
