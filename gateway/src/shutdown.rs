use std::time::Duration;

/// Wait for shutdown signal (Ctrl+C or SIGTERM), then drain for configured seconds.
pub async fn graceful_shutdown(drain_secs: u64) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
        tracing::info!("Ctrl+C received");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
        tracing::info!("SIGTERM received");
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!(
        "Shutdown signal received, draining for {}s...",
        drain_secs
    );
    tokio::time::sleep(Duration::from_secs(drain_secs)).await;
    tracing::info!("Shutdown drain complete");
}
