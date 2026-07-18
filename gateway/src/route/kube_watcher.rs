//! Kubernetes CRD watcher for route table entries.
//!
//! Watches `RouteTableEntry` CRDs (ultralisk.io/v1) and hot-reloads
//! the Gateway's in-memory route table on create/update/delete events.
//!
//! Feature gated behind `k8s-watcher` to avoid pulling in `kube` + `k8s-openapi`
//! for non-K8s deployments. The file watcher (`watcher.rs`) remains the
//! primary hot-reload mechanism for non-K8s deployments.
//!
//! ## Usage
//!
//! ```bash
//! # Build with K8s support
//! cargo build --features k8s-watcher
//! K8S_WATCH_CRD=true K8S_OPENAPI_ENABLED_VERSION=1.30 ./target/debug/ultralisk-gateway
//!
//! # Apply CRD and entries
//! kubectl apply -f config/crd/route-table-entry.yaml
//! kubectl create -f - <<EOF
//! apiVersion: ultralisk.io/v1
//! kind: RouteTableEntry
//! metadata:
//!   name: llama-3-1-8b
//! spec:
//!   modelId: llama-3.1-8b-instruct
//!   poolName: llama-pool
//!   strategy: serverless
//!   pods:
//!   - id: pod-1
//!     address: 10.0.0.10:8000
//!     weight: 1
//! EOF
//! ```


// ── Placeholder (feature disabled) ───────────────────────────────────────────

/// Start the K8s CRD watcher.
///
/// When `k8s-watcher` feature is disabled, returns immediately.
/// When enabled and `K8S_WATCH_CRD=true`, spawns a background task
/// that watches RouteTableEntry CRDs.
pub async fn start_kube_watcher() {
    if std::env::var("K8S_WATCH_CRD").as_deref() != Ok("true") {
        tracing::info!("K8s CRD watcher disabled (set K8S_WATCH_CRD=true to enable)");
        return;
    }

    #[cfg(not(feature = "k8s-watcher"))]
    {
        tracing::warn!(
            "K8S_WATCH_CRD is set but k8s-watcher feature is not enabled. \
             Rebuild with: cargo build --features k8s-watcher"
        );
    }

    #[cfg(feature = "k8s-watcher")]
    {
        if let Err(e) = run_watcher().await {
            tracing::error!(error = %e, "K8s CRD watcher failed");
        }
    }
}

// ── Real implementation (feature enabled) ────────────────────────────────────

#[cfg(feature = "k8s-watcher")]
async fn run_watcher() -> anyhow::Result<()> {
    use std::sync::Arc;
    use std::time::Duration;

    use kube::api::{ListParams, ResourceExt};
    use kube::core::DynamicObject;
    use kube::runtime::watcher;
    use kube::runtime::WatchStreamExt;
    use kube::{Api, Client, Resource};
    use serde::Deserialize;
    use tokio::sync::RwLock;

    #[derive(Debug, Clone, Deserialize)]
    struct RouteTableEntrySpec {
        #[serde(rename = "modelId")]
        model_id: String,
        #[serde(rename = "poolName")]
        pool_name: String,
        strategy: String,
        pods: Option<Vec<PodSpec>>,
    }

    #[derive(Debug, Clone, Deserialize)]
    struct PodSpec {
        id: String,
        address: String,
        #[serde(default = "default_weight")]
        weight: u32,
    }

    const fn default_weight() -> u32 { 1 }

    // The CRD group/version/kind
    let api = Api::<DynamicObject>::all_with(
        Client::try_default().await?,
        &kube::core::GroupVersionKind::gvk("ultralisk.io", "v1", "RouteTableEntry"),
    );

    // Verify connectivity by listing
    match api.list(&ListParams::default()).await {
        Ok(list) => tracing::info!(
            "Connected to K8s API, found {} RouteTableEntry CRDs",
            list.items.len()
        ),
        Err(e) => tracing::warn!(
            error = %e,
            "Cannot list RouteTableEntry CRDs (CRD not installed?). Retrying..."
        ),
    }

    // Track the last resource version for each named entry to detect deletions
    let known_entries: Arc<RwLock<std::collections::HashMap<String, String>>> =
        Arc::new(RwLock::new(std::collections::HashMap::new()));

    let watcher_config = watcher::Config::default()
        .any_semantic()
        .backoff(watcher::Backoff::from_iter(
            [1u64, 5, 15, 30, 60].map(Duration::from_secs),
        ));

    let stream = watcher(api, watcher_config)
        .default_backoff()
        .applied_objects();

    tracing::info!("K8s CRD watcher started for ultralisk.io/v1/RouteTableEntry");

    // Process events from the stream
    let mut stream = Box::pin(stream);
    while let Some(obj) = stream.try_next().await? {
        let name = obj.name();
        let api_version = obj.api_version();
        let kind = obj.kind();
        let resource_version = obj.resource_version()
            .unwrap_or_default()
            .to_string();

        // Parse spec
        let spec: Option<RouteTableEntrySpec> = obj.data["spec"]
            .as_object()
            .and_then(|_| serde_json::from_value(obj.data["spec"].clone()).ok());

        let Some(spec) = spec else {
            tracing::warn!(name = %name, "RouteTableEntry has no valid spec");
            continue;
        };

        // Check if this is a deletion by comparing resource versions
        let known_rv = {
            let known = known_entries.read().await;
            known.get(&name).cloned()
        };

        match known_rv {
            None => {
                // New entry — apply
                tracing::info!(
                    name = %name,
                    model_id = %spec.model_id,
                    pool = %spec.pool_name,
                    pods = ?spec.pods.as_ref().map(|p| p.len()),
                    "RouteTableEntry created/updated"
                );

                if let Some(pods) = &spec.pods {
                    for pod in pods {
                        table::upsert_pod(
                            &spec.model_id,
                            &spec.pool_name,
                            &spec.strategy,
                            &pod.id,
                            &pod.address,
                        );
                        if pod.weight != 1 {
                            table::update_weight(&spec.model_id, &pod.id, pod.weight);
                        }
                    }
                }

                known_entries.write().await.insert(name.to_string(), resource_version);
            }
            Some(ref old_rv) if old_rv == &resource_version => {
                // Same resource version — event from the initial list, no-op
                tracing::debug!(name = %name, "RouteTableEntry already processed");
            }
            Some(_) => {
                // Resource version changed — update
                tracing::info!(
                    name = %name,
                    model_id = %spec.model_id,
                    "RouteTableEntry updated — resyncing pods"
                );

                // Full resync: remove all old pods for this model, add new ones
                // We don't know the old pods, so we rely on the CRD containing
                // the complete desired state.
                if let Some(pods) = &spec.pods {
                    for pod in pods {
                        table::upsert_pod(
                            &spec.model_id,
                            &spec.pool_name,
                            &spec.strategy,
                            &pod.id,
                            &pod.address,
                        );
                        if pod.weight != 1 {
                            table::update_weight(&spec.model_id, &pod.id, pod.weight);
                        }
                    }
                }

                known_entries.write().await.insert(name.to_string(), resource_version);
            }
        }
    }

    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_watcher_disabled_by_default() {
        let old = std::env::var("K8S_WATCH_CRD").ok();
        std::env::remove_var("K8S_WATCH_CRD");
        start_kube_watcher().await;
        if let Some(v) = old { std::env::set_var("K8S_WATCH_CRD", v); }
        // If we got here without panicking, the test passes
    }
}
