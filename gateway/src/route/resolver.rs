use std::sync::atomic::{AtomicU64, Ordering};

use crate::types::RouteInfo;

use super::table::{Pod, Pool, ROUTE_TABLE};

/// Round-robin counter per pool. Key: pool name.
static RR_COUNTERS: once_cell::sync::Lazy<dashmap::DashMap<String, AtomicU64>> =
    once_cell::sync::Lazy::new(|| dashmap::DashMap::new());

/// Resolve model_id → RouteInfo (pod address + metadata).
/// Returns Err with (status_code, error_code) for 404/503.
pub fn resolve(model_id: &str) -> Result<RouteInfo, (axum::http::StatusCode, &'static str)> {
    let table = ROUTE_TABLE.load();

    let pool = table
        .routes
        .get(model_id)
        .ok_or((axum::http::StatusCode::NOT_FOUND, "model_not_found"))?;

    if pool.pods.is_empty() {
        return Err((
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "model_not_available",
        ));
    }

    let pod = select_pod(pool);

    Ok(RouteInfo {
        model_id: model_id.to_string(),
        pool_name: pool.name.clone(),
        pod_address: pod.address.clone(),
        strategy: pool.strategy.clone(),
    })
}

fn select_pod(pool: &Pool) -> &Pod {
    // Weighted round-robin: if all weights are equal, fast-path to simple RR.
    let all_equal = pool.pods.windows(2).all(|w| w[0].weight == w[1].weight);

    if all_equal {
        let counter = RR_COUNTERS
            .entry(pool.name.clone())
            .or_insert_with(|| AtomicU64::new(0));
        let idx = counter.fetch_add(1, Ordering::Relaxed) as usize % pool.pods.len();
        return &pool.pods[idx];
    }

    // Weighted selection: accumulate weights, compute index
    let total_weight: u32 = pool.pods.iter().map(|p| p.weight).sum();
    if total_weight == 0 {
        return &pool.pods[0];
    }

    let counter = RR_COUNTERS
        .entry(pool.name.clone())
        .or_insert_with(|| AtomicU64::new(0));
    let pos = (counter.fetch_add(1, Ordering::Relaxed) as u32) % total_weight;

    let mut cumulative = 0u32;
    for pod in &pool.pods {
        cumulative += pod.weight;
        if pos < cumulative {
            return pod;
        }
    }

    &pool.pods[0]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::route::table::{self as t, Pod, Pool, RouteTable};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    /// Reset global state to a clean slate. Must be called at the start of each test
    /// that touches ROUTE_TABLE or RR_COUNTERS.
    fn reset_no_routes() {
        t::ROUTE_TABLE.store(Arc::new(RouteTable {
            routes: HashMap::new(),
            version: 0,
        }));
        RR_COUNTERS.clear();
    }

    #[test]
    fn test_2_round_robin_wraps_correctly() {
        let _lock = TEST_MUTEX.lock().unwrap();
        reset_no_routes();
        let pods: Vec<t::Pod> = (0..3)
            .map(|i| t::Pod {
                id: format!("pod-{}", i),
                address: format!("10.0.0.{}:8000", i + 1),
                weight: 1,
            })
            .collect();
        let mut routes = HashMap::new();
        routes.insert("test-model".to_string(), Pool {
            name: "test-pool".to_string(), strategy: "serverless".to_string(), pods,
        });
        t::ROUTE_TABLE.store(Arc::new(RouteTable { routes, version: 1 }));

        let r1 = resolve("test-model").unwrap();
        let r2 = resolve("test-model").unwrap();
        let r3 = resolve("test-model").unwrap();
        let r4 = resolve("test-model").unwrap();
        assert_eq!(r1.pod_address, "10.0.0.1:8000");
        assert_eq!(r2.pod_address, "10.0.0.2:8000");
        assert_eq!(r3.pod_address, "10.0.0.3:8000");
        assert_eq!(r4.pod_address, "10.0.0.1:8000");
    }

    #[test]
    fn test_1_model_not_found_returns_404() {
        let _lock = TEST_MUTEX.lock().unwrap();
        reset_no_routes();
        let mut routes = HashMap::new();
        routes.insert("only-model".to_string(), Pool {
            name: "only-pool".to_string(), strategy: "serverless".to_string(),
            pods: vec![Pod { id: "p1".to_string(), address: "10.0.0.1:8000".to_string(), weight: 1 }],
        });
        t::ROUTE_TABLE.store(Arc::new(RouteTable { routes, version: 1 }));
        let err = resolve("nonexistent").unwrap_err();
        assert_eq!(err.0.as_u16(), 404);
    }

    #[test]
    fn test_0_empty_pool_returns_503() {
        let _lock = TEST_MUTEX.lock().unwrap();
        reset_no_routes();
        let mut routes = HashMap::new();
        routes.insert("empty-model".to_string(), Pool {
            name: "empty-pool".to_string(), strategy: "serverless".to_string(),
            pods: vec![],
        });
        t::ROUTE_TABLE.store(Arc::new(RouteTable { routes, version: 1 }));
        let err = resolve("empty-model").unwrap_err();
        assert_eq!(err.0.as_u16(), 503);
    }
}
