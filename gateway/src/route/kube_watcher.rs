//! Kubernetes CRD watcher for route table entries (design spec).
//!
//! ## Architecture
//!
//! The Gateway watches `RouteTableEntry` CRDs (ultralisk.io/v1).
//! Each CRD maps a model_id → pool with GPU worker pods.
//! On create/update/delete events, the watcher calls the dynamic
//! route table API (`upsert_pod` / `remove_pod`) to hot-reload
//! the in-memory route table without restarting.
//!
//! ## CRD Schema
//!
//! Defined in `config/crd/route-table-entry.yaml`.
//!
//! Example CRD instance:
//! ```yaml
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
//! ```
//!
//! ## Implementation Notes
//!
//! When deploying to K8s, add these dependencies to Cargo.toml:
//! ```toml
//! kube = { version = "0.98", default-features = false, features = ["client", "runtime"] }
//! k8s-openapi = { version = "0.23", features = ["v1_30"] }
//! ```
//!
//! Gateway needs a ServiceAccount with RBAC:
//! ```yaml
//! apiVersion: rbac.authorization.k8s.io/v1
//! kind: ClusterRole
//! metadata:
//!   name: gateway-route-watcher
//! rules:
//! - apiGroups: ["ultralisk.io"]
//!   resources: ["routetableentries"]
//!   verbs: ["get", "list", "watch"]
//! ```
//!
//! The watcher uses `kube::runtime::watcher()` to stream CRD events
//! and calls `table::upsert_pod()` / `table::remove_pod()` on each event.
//!
//! ## Testing
//!
//! Without a real K8s cluster, unit-test the watcher logic using
//! `kube::core::DynamicObject` constructed in-memory.
//!
//! ## Current Status
//!
//! Feature gated behind `k8s-watcher` Cargo feature. When the `kube`
//! crate is available in the dependency tree, uncomment the
//! implementation below and set `K8S_WATCH_CRD=true`.
//!
//! The file watcher (`watcher.rs`) remains the primary hot-reload
//! mechanism for non-K8s deployments.

use std::sync::Arc;
use tokio::sync::watch;

/// Placeholder: starts the K8s CRD watcher when K8s is available.
///
/// Currently returns `None` unconditionally because the `kube`
/// dependency is not compiled in.
pub async fn start_kube_watcher() -> Option<Arc<watch::Sender<()>>> {
    if std::env::var("K8S_WATCH_CRD").as_deref() != Ok("true") {
        return None;
    }

    tracing::warn!("K8S_WATCH_CRD is set but k8s-watcher feature is not compiled in.");
    tracing::info!("Add kube + k8s-openapi to Cargo.toml and enable the k8s-watcher feature.");
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_kube_watcher_disabled_by_default() {
        // Without K8S_WATCH_CRD, should return None immediately
        assert!(std::env::var("K8S_WATCH_CRD").is_err());
        let result = start_kube_watcher().await;
        assert!(result.is_none());
    }
}
