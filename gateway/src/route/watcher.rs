use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use notify::{Config, Event, EventKind, PollWatcher, RecursiveMode, Watcher};
use tokio::sync::watch;

use super::table::ROUTE_TABLE;

/// Start a file watcher on the route table JSON file.
/// When the file changes, re-load and atomically swap the route table.
///
/// Returns a shutdown sender — drop it or send () to stop the watcher.
pub fn start_watcher(path: String) -> Arc<watch::Sender<()>> {
    let (shutdown_tx, mut shutdown_rx) = watch::channel(());

    let path_c = path.clone();
    let path_for_watch = path.clone();

    tokio::spawn(async move {
        let path_obj = Path::new(&path_c);
        let parent = path_obj.parent().unwrap_or(Path::new("."));

        let (watcher_tx, mut watcher_rx) = tokio::sync::mpsc::channel(16);

        let mut watcher = match PollWatcher::new(
            move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    let _ = watcher_tx.try_send(event);
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(1)),
        ) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!(error = %e, "Failed to create file watcher");
                return;
            }
        };

        if let Err(e) = watcher.watch(parent, RecursiveMode::NonRecursive) {
            tracing::error!(error = %e, path = %path_c, "Failed to watch route table directory");
            return;
        }

        tracing::info!(path = %path_c, "Route table file watcher started");

        loop {
            tokio::select! {
                Some(event) = watcher_rx.recv() => {
                    let is_our_file = match &event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) => {
                            event.paths.iter().any(|p| p.ends_with(&path_for_watch))
                        }
                        _ => false,
                    };

                    if !is_our_file {
                        continue;
                    }

                    // Small delay to let the writer finish
                    tokio::time::sleep(Duration::from_millis(100)).await;

                    match std::fs::read_to_string(&path_for_watch) {
                        Ok(content) => {
                            match serde_json::from_str::<super::table::RouteTableConfig>(&content) {
                                Ok(config) => {
                                    let new_table = load_route_table_from_config(config);
                                    let version = new_table.version;
                                    ROUTE_TABLE.store(Arc::new(new_table));
                                    tracing::info!(
                                        path = %path_for_watch,
                                        version = version,
                                        "Route table hot-reloaded"
                                    );
                                    metrics::counter!("gateway_route_table_reloads_total").increment(1);
                                }
                                Err(e) => {
                                    tracing::error!(
                                        error = %e,
                                        path = %path_for_watch,
                                        "Failed to parse route table on hot-reload — keeping existing table"
                                    );
                                    metrics::counter!("gateway_route_table_reload_errors_total").increment(1);
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!(
                                error = %e,
                                path = %path_for_watch,
                                "Failed to read route table on hot-reload"
                            );
                        }
                    }
                }
                _ = shutdown_rx.changed() => {
                    tracing::info!("Route table file watcher stopped");
                    return;
                }
            }
        }
    });

    Arc::new(shutdown_tx)
}

fn load_route_table_from_config(
    config: super::table::RouteTableConfig,
) -> super::table::RouteTable {
    use std::collections::HashMap;
    use super::table::{Pool, Pod};

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

    super::table::RouteTable {
        routes,
        version: config.version,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::table::load_route_table;
    use std::time::Duration;

    fn reset_no_routes() {
        use std::collections::HashMap;
        use super::super::table::RouteTable;
        crate::route::table::ROUTE_TABLE.store(Arc::new(RouteTable {
            routes: HashMap::new(),
            version: 0,
        }));
    }

    #[tokio::test]
    async fn test_watcher_reloads_on_file_change() {
        reset_no_routes();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("route_table.json");
        let path_str = path.to_str().unwrap().to_string();

        // Write initial config
        let initial = r#"{
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
        std::fs::write(&path, initial).unwrap();

        // Replace the global route table with initial config
        {
            let table = load_route_table(&path_str);
            ROUTE_TABLE.store(Arc::new(table));
        }

        // Start watcher
        let _shutdown = start_watcher(path_str.clone());

        // Wait for watcher to initialize
        tokio::time::sleep(Duration::from_millis(1000)).await;

        // Write updated config with a short delay between writes
        let updated = r#"{
            "version": 2,
            "routes": {
                "model-a": {
                    "name": "pool-a",
                    "strategy": "serverless",
                    "pods": [
                        {"id": "pod-1", "address": "10.0.0.1:8000", "weight": 1},
                        {"id": "pod-2", "address": "10.0.0.2:8000", "weight": 2}
                    ]
                },
                "model-b": {
                    "name": "pool-b",
                    "strategy": "batch",
                    "pods": [
                        {"id": "b-1", "address": "10.0.0.3:8000", "weight": 1}
                    ]
                }
            }
        }"#;
        std::fs::write(&path, updated).unwrap();

        // Wait for watcher to detect and reload
        tokio::time::sleep(Duration::from_secs(4)).await;

        let table = ROUTE_TABLE.load();
        assert_eq!(table.version, 2, "Route table should be reloaded with version 2");
        assert!(table.routes.contains_key("model-b"), "model-b should exist after reload");
        assert_eq!(table.routes.get("model-a").unwrap().pods.len(), 2, "model-a should have 2 pods after reload");
    }
}
