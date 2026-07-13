use std::collections::HashMap;
use std::sync::Arc;
use arc_swap::ArcSwap;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct RouteTableConfig {
    pub version: u64,
    pub routes: HashMap<String, PoolConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PoolConfig {
    pub name: String,
    pub strategy: String,
    pub pods: Vec<PodConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PodConfig {
    pub id: String,
    pub address: String,
    pub weight: u32,
}

#[derive(Debug, Clone)]
pub struct RouteTable {
    pub routes: HashMap<String, Pool>,
    pub version: u64,
}

#[derive(Debug, Clone)]
pub struct Pool {
    pub name: String,
    pub pods: Vec<Pod>,
    pub strategy: String,
}

#[derive(Debug, Clone)]
pub struct Pod {
    pub id: String,
    pub address: String,
    pub weight: u32,
}

pub static ROUTE_TABLE: once_cell::sync::Lazy<ArcSwap<RouteTable>> =
    once_cell::sync::Lazy::new(|| {
        ArcSwap::from_pointee(RouteTable {
            routes: HashMap::new(),
            version: 0,
        })
    });

/// Add or update a pod in the route table dynamically.
/// Called when KAI Scheduler provisions a new GPU worker or during warmup.
pub fn upsert_pod(model_id: &str, pool_name: &str, strategy: &str, pod_id: &str, pod_address: &str) {
    let current = ROUTE_TABLE.load();
    let mut routes = current.routes.clone();

    let pool = routes.entry(model_id.to_string()).or_insert_with(|| Pool {
        name: pool_name.to_string(),
        strategy: strategy.to_string(),
        pods: Vec::new(),
    });

    pool.name = pool_name.to_string();
    pool.strategy = strategy.to_string();

    if let Some(existing) = pool.pods.iter_mut().find(|p| p.id == pod_id) {
        existing.address = pod_address.to_string();
    } else {
        pool.pods.push(Pod {
            id: pod_id.to_string(),
            address: pod_address.to_string(),
            weight: 1,
        });
    }

    let new_version = current.version + 1;
    ROUTE_TABLE.store(Arc::new(RouteTable {
        routes,
        version: new_version,
    }));

    tracing::info!(
        model_id = %model_id,
        pod_id = %pod_id,
        address = %pod_address,
        version = new_version,
        "Route table updated dynamically"
    );
}

/// Remove a pod from the route table dynamically.
pub fn remove_pod(model_id: &str, pod_id: &str) {
    let current = ROUTE_TABLE.load();
    let mut routes = current.routes.clone();

    if let Some(pool) = routes.get_mut(model_id) {
        pool.pods.retain(|p| p.id != pod_id);
        if pool.pods.is_empty() {
            routes.remove(model_id);
        }
    }

    let new_version = current.version + 1;
    ROUTE_TABLE.store(Arc::new(RouteTable {
        routes,
        version: new_version,
    }));

    tracing::info!(
        model_id = %model_id,
        pod_id = %pod_id,
        "Pod removed from route table"
    );
}

/// Load route table from JSON file. Called synchronously at startup.
/// Panics if file is missing or invalid — Gateway cannot run without routes.
pub fn load_route_table(path: &str) -> RouteTable {
    let content = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("Failed to read route table from {}: {}", path, e));
    let config: RouteTableConfig = serde_json::from_str(&content)
        .expect("Failed to parse route table JSON");

    let routes: HashMap<String, Pool> = config
        .routes
        .into_iter()
        .map(|(model_id, pool_cfg)| {
            let pool = Pool {
                name: pool_cfg.name,
                strategy: pool_cfg.strategy,
                pods: pool_cfg
                    .pods
                    .into_iter()
                    .map(|p| Pod {
                        id: p.id,
                        address: p.address,
                        weight: p.weight,
                    })
                    .collect(),
            };
            (model_id, pool)
        })
        .collect();

    RouteTable {
        routes,
        version: config.version,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_deserialize_empty() {
        let json = r#"{"version": 0, "routes": {}}"#;
        let config: RouteTableConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.version, 0);
        assert!(config.routes.is_empty());
    }

    #[test]
    fn test_deserialize_with_routes() {
        let json = r#"{
            "version": 1,
            "routes": {
                "model-a": {
                    "name": "pool-a",
                    "strategy": "serverless",
                    "pods": [
                        {"id": "pod-1", "address": "10.0.0.1:8000", "weight": 1}
                    ]
                }
            }
        }"#;
        let config: RouteTableConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.routes.len(), 1);
        let pool = config.routes.get("model-a").unwrap();
        assert_eq!(pool.name, "pool-a");
        assert_eq!(pool.pods[0].address, "10.0.0.1:8000");
    }

    #[test]
    fn test_load_route_table_from_file() {
        let json = r#"{
            "version": 1,
            "routes": {
                "model-x": {
                    "name": "pool-x",
                    "strategy": "serverless",
                    "pods": [
                        {"id": "x-1", "address": "10.0.0.1:8000", "weight": 1},
                        {"id": "x-2", "address": "10.0.0.2:8000", "weight": 1}
                    ]
                }
            }
        }"#;
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(json.as_bytes()).unwrap();
        let path = file.path().to_str().unwrap();

        let table = load_route_table(path);
        assert_eq!(table.version, 1);
        assert_eq!(table.routes.len(), 1);
        let pool = table.routes.get("model-x").unwrap();
        assert_eq!(pool.pods.len(), 2);
    }
}
