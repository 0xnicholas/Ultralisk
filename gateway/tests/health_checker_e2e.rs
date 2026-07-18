//! Integration tests for HealthChecker that require network access.
//!
//! These are separate from unit tests because they make actual HTTP
//! connections to arbitrary addresses. They're run with `cargo test --test health_checker_e2e`
//! and can be skipped in environments without network access.

use ultralisk_gateway::health_checker::{HealthChecker, HealthCheckerConfig, PodHealth};

#[tokio::test]
async fn test_check_pod_unreachable_returns_unhealthy() {
    let checker = HealthChecker::new(HealthCheckerConfig {
        timeout_secs: 3,
        ..Default::default()
    });
    // RFC 5737 TEST-NET-1 — guaranteed unreachable, should time out
    let start = std::time::Instant::now();
    let health = checker.check_pod("203.0.113.1:9999").await;
    let elapsed = start.elapsed();
    assert!(matches!(health, PodHealth::Unhealthy { .. }));
    assert!(elapsed.as_secs() < 10, "Health check took too long: {:?}", elapsed);
}
