//! Passive health checker — Layer 2 + Layer 3 of the ADR-002 health model.
//!
//! Layer 2: Observes actual inference request outcomes (success/failure/latency)
//!          for each upstream pod. When error rate exceeds threshold, marks pod
//!          as unhealthy. When error rate recovers, restores healthy.
//!
//! Layer 3 (Circuit Breaker): Tracks consecutive fatal failures. When threshold
//!          is reached, trips the breaker. After cooldown, sends a probe request
//!          to the pod's /health endpoint. Success → close breaker. Failure →
//!          retrip and extend cooldown.
//!
//! This catches issues that active polling misses:
//!   - Model returns garbage but /health returns 200
//!   - Intermittent timeouts that don't align with poll intervals
//!   - Gradual performance degradation (P99 creep)
//!   - Repeated OOM crashes (breaker prevents cascade)
//!
//! Design:
//!   Per-pod state tracks ring buffer + consecutive failures + breaker state.
//!   On each report, evaluates both error rate (Layer 2) and consecutive
//!   failures (Layer 3). Circuit breaker probes the pod's /health endpoint
//!   directly when cooldown expires.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use metrics::counter;
use tokio::sync::RwLock;

use crate::health_checker::{HealthChecker, PodHealth};

// ── Configuration ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PassiveCheckerConfig {
    /// Size of the sliding window (number of recent requests to track).
    pub window_size: usize,
    /// Error rate threshold (0.0–1.0). Above this → mark unhealthy.
    pub error_threshold: f64,
    /// P99 latency threshold in ms. Above this → mark unhealthy.
    pub latency_threshold_ms: u64,
    /// Minimum requests before evaluating (avoid noise on cold start).
    pub min_samples: usize,
    /// Cooldown: don't flip health again until this duration has passed.
    pub cooldown_secs: u64,
    // ── Circuit breaker (Layer 3) ──
    /// Consecutive fatal failures before tripping the breaker.
    pub breaker_trip_count: u32,
    /// How long the breaker stays open before probing.
    pub breaker_cooldown_secs: u64,
    /// HTTP probe timeout in seconds.
    pub breaker_probe_timeout_secs: u64,
}

impl Default for PassiveCheckerConfig {
    fn default() -> Self {
        Self {
            window_size: 100,
            error_threshold: 0.2,      // 20% error rate → unhealthy
            latency_threshold_ms: 10_000, // 10s P99 → unhealthy
            min_samples: 10,
            cooldown_secs: 30,
            breaker_trip_count: 3,
            breaker_cooldown_secs: 30,
            breaker_probe_timeout_secs: 5,
        }
    }
}

// ── Per-pod outcome ring buffer ──────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum Outcome {
    Success { latency_ms: u64 },
    Failure { latency_ms: u64, error: String },
    Timeout { latency_ms: u64 },
}

struct PodStats {
    /// Ring buffer of recent outcomes.
    outcomes: Vec<Outcome>,
    /// Next write position in the ring buffer.
    cursor: usize,
    /// When we last flipped this pod's health status (for cooldown).
    last_flipped: Option<Instant>,
    // ── Circuit breaker state (Layer 3) ──
    /// Consecutive fatal failures since last success.
    consecutive_failures: u32,
    /// When the breaker tripped (None = closed).
    breaker_tripped_at: Option<Instant>,
    /// Whether we're in half-open (probing) state.
    half_open: bool,
}

impl PodStats {
    fn new(window_size: usize) -> Self {
        Self {
            outcomes: Vec::with_capacity(window_size),
            cursor: 0,
            last_flipped: None,
            consecutive_failures: 0,
            breaker_tripped_at: None,
            half_open: false,
        }
    }

    fn push(&mut self, outcome: Outcome) {
        // Update consecutive failure counter
        match &outcome {
            Outcome::Success { .. } => self.consecutive_failures = 0,
            _ => self.consecutive_failures += 1,
        }

        if self.outcomes.len() < self.outcomes.capacity() {
            self.outcomes.push(outcome);
        } else {
            self.outcomes[self.cursor] = outcome;
            self.cursor = (self.cursor + 1) % self.outcomes.capacity();
        }
    }

    fn error_rate(&self) -> f64 {
        if self.outcomes.is_empty() {
            return 0.0;
        }
        let errors = self.outcomes.iter().filter(|o| !matches!(o, Outcome::Success { .. })).count();
        errors as f64 / self.outcomes.len() as f64
    }

    fn p99_latency(&self) -> u64 {
        if self.outcomes.len() < 2 {
            return 0;
        }
        let mut latencies: Vec<u64> = self.outcomes.iter().map(|o| match o {
            Outcome::Success { latency_ms } => *latency_ms,
            Outcome::Failure { latency_ms, .. } => *latency_ms,
            Outcome::Timeout { latency_ms } => *latency_ms,
        }).collect();
        latencies.sort_unstable();
        // P99 index: floor(n * 0.99), clamped to valid range
        let idx = ((latencies.len() as f64) * 0.99).floor() as usize;
        let idx = idx.saturating_sub(1).min(latencies.len() - 1);
        latencies[idx]
    }
}

// ── Passive Checker ──────────────────────────────────────────────────────────

pub struct PassiveChecker {
    config: PassiveCheckerConfig,
    /// Per-pod stats: key = (model_id, pool_name, pod_id)
    stats: RwLock<HashMap<(String, String, String), PodStats>>,
    /// Reference to the active health checker (to update pod health).
    health_checker: Arc<HealthChecker>,
    /// HTTP client for circuit breaker probes.
    probe_client: reqwest::Client,
}

impl PassiveChecker {
    pub fn new(config: PassiveCheckerConfig, health_checker: Arc<HealthChecker>) -> Self {
        let probe_timeout = config.breaker_probe_timeout_secs;
        Self {
            config,
            stats: RwLock::new(HashMap::new()),
            health_checker,
            probe_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(probe_timeout))
                .build()
                .expect("Failed to build probe HTTP client"),
        }
    }

    /// Report a request outcome for a specific pod.
    /// Called by the proxy handler after each upstream request completes.
    pub async fn report_outcome(
        &self,
        model_id: &str,
        pool_name: &str,
        pod_id: &str,
        outcome: Outcome,
    ) {
        let key = (model_id.to_string(), pool_name.to_string(), pod_id.to_string());

        // Record
        {
            let mut stats = self.stats.write().await;
            let pod_stats = stats.entry(key.clone()).or_insert_with(|| PodStats::new(self.config.window_size));
            pod_stats.push(outcome);
        }

        // Evaluate — hold read lock briefly
        let (error_rate, p99, sample_count) = {
            let stats = self.stats.read().await;
            if let Some(ps) = stats.get(&key) {
                if ps.outcomes.len() < self.config.min_samples {
                    return; // not enough data yet
                }
                (ps.error_rate(), ps.p99_latency(), ps.outcomes.len())
            } else {
                return;
            }
        };

        // Check cooldown
        let in_cooldown = {
            let stats = self.stats.read().await;
            stats.get(&key).and_then(|ps| ps.last_flipped).map_or(false, |flipped| {
                flipped.elapsed() < Duration::from_secs(self.config.cooldown_secs)
            })
        };
        if in_cooldown {
            return;
        }

        // Decide whether to flip health
        let should_be_unhealthy = error_rate >= self.config.error_threshold
            || p99 >= self.config.latency_threshold_ms;

        // Current health from the active checker
        let current_health = self.health_checker.get_pod_health(model_id, pool_name, pod_id);

        let needs_flip = match (&current_health, should_be_unhealthy) {
            (Some(PodHealth::Healthy), true) => true,    // healthy → should be unhealthy
            (Some(PodHealth::Unhealthy { .. }), false) => true, // unhealthy → should be healthy
            _ => false, // already in correct state
        };

        if needs_flip {
            let new_health = if should_be_unhealthy {
                counter!("gateway_passive_check_unhealthy_total",
                    "model" => model_id.to_string(),
                    "pool" => pool_name.to_string(),
                    "pod" => pod_id.to_string(),
                    "reason" => if error_rate >= self.config.error_threshold { "error_rate" } else { "latency" },
                ).increment(1);
                tracing::warn!(
                    model_id = %model_id,
                    pod_id = %pod_id,
                    error_rate = %error_rate,
                    p99_ms = %p99,
                    samples = %sample_count,
                    "Passive check: marking pod unhealthy"
                );
                PodHealth::Unhealthy {
                    since: Instant::now(),
                    failures: (error_rate * 100.0) as u32,
                }
            } else {
                tracing::info!(
                    model_id = %model_id,
                    pod_id = %pod_id,
                    error_rate = %error_rate,
                    p99_ms = %p99,
                    "Passive check: restoring pod to healthy"
                );
                PodHealth::Healthy
            };

            // Update the health checker state
            self.health_checker.set_pod_health(model_id, pool_name, pod_id, new_health);

            // Record flip time for cooldown
            let mut stats = self.stats.write().await;
            if let Some(ps) = stats.get_mut(&key) {
                ps.last_flipped = Some(Instant::now());
            }
        }

        // ── Circuit breaker (Layer 3) ──
        let breaker_action = {
            let stats = self.stats.read().await;
            stats.get(&key).map(|ps| {
                let breaker_tripped = ps.breaker_tripped_at.is_some();
                let cooldown_expired = ps.breaker_tripped_at
                    .map(|t| t.elapsed() >= Duration::from_secs(self.config.breaker_cooldown_secs))
                    .unwrap_or(false);
                (ps.consecutive_failures, breaker_tripped, cooldown_expired, ps.half_open)
            })
        };

        if let Some((consecutive_failures, breaker_tripped, cooldown_expired, half_open)) = breaker_action {
            // Trip breaker if consecutive failures exceed threshold
            if !breaker_tripped && consecutive_failures >= self.config.breaker_trip_count {
                counter!("gateway_circuit_breaker_tripped_total",
                    "model" => model_id.to_string(),
                    "pool" => pool_name.to_string(),
                    "pod" => pod_id.to_string(),
                ).increment(1);
                tracing::warn!(
                    model_id = %model_id,
                    pod_id = %pod_id,
                    consecutive_failures = %consecutive_failures,
                    "Circuit breaker tripped"
                );

                self.health_checker.set_pod_health(model_id, pool_name, pod_id,
                    PodHealth::Unhealthy {
                        since: Instant::now(),
                        failures: consecutive_failures,
                    });

                let mut stats = self.stats.write().await;
                if let Some(ps) = stats.get_mut(&key) {
                    ps.breaker_tripped_at = Some(Instant::now());
                }
            }

            // Half-open probe: cooldown expired → try a health check
            if breaker_tripped && cooldown_expired && !half_open {
                let mut stats = self.stats.write().await;
                if let Some(ps) = stats.get_mut(&key) {
                    ps.half_open = true;
                }
                // Drop the lock before making HTTP request
            }

            if half_open {
                // Send a probe request to the pod's /health endpoint
                let probe_url = format!("http://{}/health", pod_id);
                let probe_result = self.probe_client.get(&probe_url).send().await;

                match probe_result {
                    Ok(resp) if resp.status().is_success() => {
                        tracing::info!(
                            model_id = %model_id,
                            pod_id = %pod_id,
                            "Circuit breaker: probe succeeded, closing breaker"
                        );
                        self.health_checker.set_pod_health(model_id, pool_name, pod_id,
                            PodHealth::Healthy);

                        let mut stats = self.stats.write().await;
                        if let Some(ps) = stats.get_mut(&key) {
                            ps.breaker_tripped_at = None;
                            ps.half_open = false;
                            ps.consecutive_failures = 0;
                            ps.last_flipped = Some(Instant::now());
                        }
                    }
                    _ => {
                        counter!("gateway_circuit_breaker_retrip_total",
                            "model" => model_id.to_string(),
                            "pool" => pool_name.to_string(),
                            "pod" => pod_id.to_string(),
                        ).increment(1);
                        tracing::warn!(
                            model_id = %model_id,
                            pod_id = %pod_id,
                            "Circuit breaker: probe failed, retripping"
                        );

                        self.health_checker.set_pod_health(model_id, pool_name, pod_id,
                            PodHealth::Unhealthy {
                                since: Instant::now(),
                                failures: consecutive_failures,
                            });

                        let mut stats = self.stats.write().await;
                        if let Some(ps) = stats.get_mut(&key) {
                            ps.breaker_tripped_at = Some(Instant::now());
                            ps.half_open = false;
                        }
                    }
                }
            }
        }
    }

    /// Get current stats snapshot for a pod (debugging / metrics).
    pub async fn get_stats(&self, model_id: &str, pool_name: &str, pod_id: &str) -> Option<(f64, u64, usize)> {
        let stats = self.stats.read().await;
        stats.get(&(model_id.to_string(), pool_name.to_string(), pod_id.to_string())).map(|ps| {
            (ps.error_rate(), ps.p99_latency(), ps.outcomes.len())
        })
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health_checker::{HealthChecker, HealthCheckerConfig};

    #[tokio::test]
    async fn test_pod_stats_ring_buffer() {
        let mut stats = PodStats::new(5);
        for i in 0..10 {
            stats.push(Outcome::Success { latency_ms: i * 10 });
        }
        assert_eq!(stats.outcomes.len(), 5); // capped at window size
        assert_eq!(stats.error_rate(), 0.0); // all successes
    }

    #[tokio::test]
    async fn test_pod_stats_error_rate() {
        let mut stats = PodStats::new(10);
        for _ in 0..7 {
            stats.push(Outcome::Success { latency_ms: 100 });
        }
        for _ in 0..3 {
            stats.push(Outcome::Failure { latency_ms: 100, error: "timeout".into() });
        }
        assert!((stats.error_rate() - 0.3).abs() < 0.01);
        assert_eq!(stats.outcomes.len(), 10);
    }

    #[tokio::test]
    async fn test_p99_latency() {
        let mut stats = PodStats::new(100);
        // 90 requests at 100ms, 10 requests at 5000ms
        // P99 of 100 values = 99th percentile = 5000 (the 10 slow ones)
        for _ in 0..90 {
            stats.push(Outcome::Success { latency_ms: 100 });
        }
        for _ in 0..10 {
            stats.push(Outcome::Timeout { latency_ms: 5000 });
        }
        // 90 at 100ms + 10 at 5000ms → index 98 = 100, index 99 = 5000
        // P99 floor calc: floor(100 * 0.99) = 99 → idx = 98 → latencies[98] = 100
        // But we want the tail: use a case where P99 catches the slow ones
        assert_eq!(stats.p99_latency(), 5000);
    }

    #[tokio::test]
    async fn test_report_outcome_below_threshold() {
        let hc = Arc::new(HealthChecker::new(HealthCheckerConfig::default()));
        let pc = PassiveChecker::new(PassiveCheckerConfig {
            window_size: 10,
            error_threshold: 0.5,
            min_samples: 3,
            ..Default::default()
        }, hc.clone());

        // 2 errors out of 5 = 40% — below 50% threshold
        for _ in 0..3 {
            pc.report_outcome("m", "p", "pod-1", Outcome::Success { latency_ms: 100 }).await;
        }
        for _ in 0..2 {
            pc.report_outcome("m", "p", "pod-1", Outcome::Failure { latency_ms: 100, error: "err".into() }).await;
        }

        // Should still be healthy (no flip)
        let health = hc.get_pod_health("m", "p", "pod-1");
        assert!(health.is_none(), "should not flip below threshold");
    }

    #[tokio::test]
    async fn test_report_outcome_above_threshold() {
        let hc = Arc::new(HealthChecker::new(HealthCheckerConfig::default()));
        let pc = PassiveChecker::new(PassiveCheckerConfig {
            window_size: 10,
            error_threshold: 0.3,
            min_samples: 3,
            cooldown_secs: 1,
            ..Default::default()
        }, hc.clone());

        // Pre-mark as healthy so there's a baseline
        hc.set_pod_health("m", "p", "pod-1", PodHealth::Healthy);

        // 4 errors out of 5 = 80% — above 30% threshold
        for _ in 0..1 {
            pc.report_outcome("m", "p", "pod-1", Outcome::Success { latency_ms: 100 }).await;
        }
        for _ in 0..4 {
            pc.report_outcome("m", "p", "pod-1", Outcome::Failure { latency_ms: 100, error: "timeout".into() }).await;
        }

        // Should flip to unhealthy
        let health = hc.get_pod_health("m", "p", "pod-1");
        match health {
            Some(PodHealth::Unhealthy { .. }) => {} // expected
            other => panic!("Expected Unhealthy, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_report_outcome_recovers() {
        let hc = Arc::new(HealthChecker::new(HealthCheckerConfig::default()));
        let pc = PassiveChecker::new(PassiveCheckerConfig {
            window_size: 10,
            error_threshold: 0.3,
            min_samples: 3,
            cooldown_secs: 0, // no cooldown for test
            ..Default::default()
        }, hc.clone());

        // Mark as unhealthy first
        hc.set_pod_health("m", "p", "pod-1", PodHealth::Unhealthy {
            since: Instant::now(),
            failures: 5,
        });

        // All successes — should recover
        for _ in 0..10 {
            pc.report_outcome("m", "p", "pod-1", Outcome::Success { latency_ms: 100 }).await;
        }

        let health = hc.get_pod_health("m", "p", "pod-1");
        assert!(matches!(health, Some(PodHealth::Healthy)), "should recover to healthy after errors stop");
    }

    #[tokio::test]
    async fn test_circuit_breaker_trips_on_consecutive_failures() {
        let hc = Arc::new(HealthChecker::new(HealthCheckerConfig::default()));
        hc.set_pod_health("m", "p", "pod-1", PodHealth::Healthy);

        let pc = PassiveChecker::new(PassiveCheckerConfig {
            min_samples: 2,             // evaluate after 2 samples
            breaker_trip_count: 3,       // trip after 3 consecutive failures
            breaker_cooldown_secs: 0,    // no cooldown for test
            error_threshold: 0.9,        // disable Layer 2 (high threshold)
            ..Default::default()
        }, hc.clone());

        // 2 successes first (to pass min_samples)
        pc.report_outcome("m", "p", "pod-1", Outcome::Success { latency_ms: 100 }).await;
        pc.report_outcome("m", "p", "pod-1", Outcome::Success { latency_ms: 100 }).await;

        // 3 consecutive failures — should trip breaker
        for _ in 0..3 {
            pc.report_outcome("m", "p", "pod-1", Outcome::Failure { latency_ms: 100, error: "OOM".into() }).await;
        }

        let health = hc.get_pod_health("m", "p", "pod-1");
        match health {
            Some(PodHealth::Unhealthy { failures, .. }) => {
                assert!(failures >= 3, "should have at least 3 failures");
            }
            other => panic!("Expected Unhealthy after breaker trip, got {:?}", other),
        }
    }
}
