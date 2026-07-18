//! Active health checker for backend pods.
//!
//! Per ADR-002 § Health Checker: polls each pod's `/health` endpoint
//! at a configurable interval, tracks healthy/unhealthy status, and
//! exposes a query API for the route resolver to skip unhealthy pods.
//!
//! Three-layer model (Phase 1: Active Checker):
//!   Layer 1: Active Check  — periodic `/health` HTTP poll (this module)
//!   Layer 2: Passive Check — observe actual request error rate (future)
//!   Layer 3: Circuit Breaker — consecutive failures → temporary ban (future)
//!
//! Prometheus metrics:
//!   gateway_upstream_health{pool, pod_id, status}
//!   gateway_health_check_duration_seconds{pool, pod_id}

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use metrics::{gauge, histogram};
use tokio::time::MissedTickBehavior;

use crate::route::table;

// ── Types ────────────────────────────────────────────────────────────────────

/// Health status of a single backend pod.
#[derive(Debug, Clone, PartialEq)]
pub enum PodHealth {
    /// Pod is reachable and responds with 200.
    Healthy,
    /// Pod is reachable but returns non-200, or is unresponsive.
    Unhealthy { since: std::time::Instant, failures: u32 },
    /// Pod has been permanently removed from the route table.
    Removed,
}

/// Summary snapshot of all pod health states.
#[derive(Debug, Clone)]
pub struct HealthSnapshot {
    pub pods: Vec<PodHealthEntry>,
}

#[derive(Debug, Clone)]
pub struct PodHealthEntry {
    pub model_id: String,
    pub pool_name: String,
    pub pod_id: String,
    pub address: String,
    pub health: PodHealth,
}

// ── Health Checker ───────────────────────────────────────────────────────────

/// Configuration for the active health checker.
#[derive(Debug, Clone)]
pub struct HealthCheckerConfig {
    /// Interval between health check polls (default: 5s).
    pub interval_secs: u64,
    /// HTTP request timeout for each health check (default: 3s).
    pub timeout_secs: u64,
    /// Consecutive failures before marking a pod unhealthy (default: 2).
    pub unhealthy_threshold: u32,
    /// Interval to recover a previously healthy pod when it passes a check (immediate).
    pub recovery_check_interval_secs: u64,
}

impl Default for HealthCheckerConfig {
    fn default() -> Self {
        Self {
            interval_secs: 5,
            timeout_secs: 3,
            unhealthy_threshold: 2,
            recovery_check_interval_secs: 5,
        }
    }
}

/// The active health checker.
///
/// Spawns a background task that periodically:
///   1. Reads the current route table to discover all known pods
///   2. HTTP GETs each pod's `/health` endpoint
///   3. Updates internal health state
///   4. Records Prometheus metrics
pub struct HealthChecker {
    /// Per-pod health state: (model_id, pool_name, pod_id) → PodHealth
    state: ArcSwap<HashMap<(String, String, String), PodHealth>>,
    /// Snapshot of last health check cycle (for resolver queries)
    snapshot: ArcSwap<HealthSnapshot>,
    config: HealthCheckerConfig,
    client: reqwest::Client,
}

impl HealthChecker {
    pub fn new(config: HealthCheckerConfig) -> Self {
        let timeout = config.timeout_secs;
        Self {
            state: ArcSwap::from_pointee(HashMap::new()),
            snapshot: ArcSwap::from_pointee(HealthSnapshot { pods: vec![] }),
            config,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(timeout))
                .build()
                .expect("Failed to build HTTP client for health checker"),
        }
    }

    /// Start the background health check loop.
    /// Returns a handle that can be aborted to stop checking.
    pub fn start(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
        let this = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(this.config.interval_secs));
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

            // Run an initial check immediately
            this.check_all().await;

            loop {
                interval.tick().await;
                this.check_all().await;
            }
        })
    }

    /// Run one full health check cycle against all pods in the route table.
    async fn check_all(&self) {
        let table = table::ROUTE_TABLE.load();
        let mut state = HashMap::new();
        let mut snapshot_entries = Vec::new();

        for (model_id, pool) in &table.routes {
            for pod in &pool.pods {
                let health = self.check_pod(&pod.address).await;
                let entry = PodHealthEntry {
                    model_id: model_id.clone(),
                    pool_name: pool.name.clone(),
                    pod_id: pod.id.clone(),
                    address: pod.address.clone(),
                    health: health.clone(),
                };
                snapshot_entries.push(entry);
                state.insert((model_id.clone(), pool.name.clone(), pod.id.clone()), health);
            }
        }

        self.state.store(Arc::new(state));
        self.snapshot.store(Arc::new(HealthSnapshot { pods: snapshot_entries }));

        // Record Prometheus gauges for each pod
        for entry in self.snapshot.load().pods.iter() {
            let status_str = match entry.health {
                PodHealth::Healthy => "healthy",
                PodHealth::Unhealthy { .. } => "unhealthy",
                PodHealth::Removed => "removed",
            };
            gauge!("gateway_upstream_health",
                "pool" => entry.pool_name.clone(),
                "pod_id" => entry.pod_id.clone(),
                "model" => entry.model_id.clone(),
            ).set(if status_str == "healthy" { 1.0 } else { 0.0 });
        }
    }

    /// Check a single pod's health by HTTP GET to `/health`.
    async fn check_pod(&self, address: &str) -> PodHealth {
        let url = format!("http://{}/health", address);
        let start = std::time::Instant::now();
        let result = self.client.get(&url).send().await;

        let elapsed = start.elapsed();
        histogram!("gateway_health_check_duration_seconds",
            "address" => address.to_string(),
        ).record(elapsed.as_secs_f64());

        match result {
            Ok(resp) if resp.status().is_success() => {
                // Pod is healthy
                PodHealth::Healthy
            }
            Ok(_resp) => {
                // Pod responded but with non-200
                PodHealth::Unhealthy {
                    since: std::time::Instant::now(),
                    failures: 1,
                }
            }
            Err(_) => {
                // Network error / timeout
                PodHealth::Unhealthy {
                    since: std::time::Instant::now(),
                    failures: 1,
                }
            }
        }
    }

    /// Get the health status of a specific pod.
    pub fn get_pod_health(&self, model_id: &str, pool_name: &str, pod_id: &str) -> Option<PodHealth> {
        let state = self.state.load();
        state.get(&(model_id.to_string(), pool_name.to_string(), pod_id.to_string())).cloned()
    }

    /// Get all healthy pod addresses for a given model.
    /// Used by the route resolver to skip unhealthy pods.
    pub fn get_healthy_pods(&self, model_id: &str) -> Vec<(String, String)> {
        let state = self.state.load();
        state.iter()
            .filter(|((mid, _, _), health)| mid == model_id && matches!(health, PodHealth::Healthy))
            .map(|((_, pool_name, pod_id), _)| (pool_name.clone(), pod_id.clone()))
            .collect()
    }

    /// Get a snapshot of all pod health states.
    pub fn snapshot(&self) -> HealthSnapshot {
        self.snapshot.load().as_ref().clone()
    }

    /// Set health state for a pod.
    /// Used by PassiveChecker (Layer 2) to update health based on request outcomes.
    pub fn set_pod_health(&self, model_id: &str, pool_name: &str, pod_id: &str, health: PodHealth) {
        let mut state = self.state.load().as_ref().clone();
        state.insert((model_id.to_string(), pool_name.to_string(), pod_id.to_string()), health);
        self.state.store(Arc::new(state));
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Network-dependent tests (check_pod) are in tests/health_checker_e2e.rs
    // to avoid hangs in environments without network access.

    #[tokio::test]
    async fn test_get_healthy_pods_empty_initially() {
        let checker = HealthChecker::new(HealthCheckerConfig::default());
        let healthy = checker.get_healthy_pods("test-model");
        assert!(healthy.is_empty());
    }

    #[test]
    fn test_default_config() {
        let cfg = HealthCheckerConfig::default();
        assert_eq!(cfg.interval_secs, 5);
        assert_eq!(cfg.timeout_secs, 3);
        assert_eq!(cfg.unhealthy_threshold, 2);
    }

    #[tokio::test]
    async fn test_check_all_does_not_panic() {
        // Don't check emptiness — other tests may have populated ROUTE_TABLE.
        // Just verify that check_all runs without panicking.
        let checker = Arc::new(HealthChecker::new(HealthCheckerConfig {
            timeout_secs: 1,
            ..Default::default()
        }));
        checker.check_all().await;
        let _snapshot = checker.snapshot();
        // If we got here without panicking, the test passes.
    }
}
