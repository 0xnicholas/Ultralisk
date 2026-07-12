pub mod config;
mod error;
mod health;
pub mod types;
mod middleware;
mod extract;
mod route;
mod rate_limit;
mod proxy;
mod cold_start;
pub mod app;
mod shutdown;

use config::AppConfig;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let config = AppConfig::from_env();
    tracing::info!("Starting Gateway on port {}", config.gateway_port);

    let app = app::build(config.clone()).await?;

    let listener =
        tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.gateway_port)).await?;
    tracing::info!("Gateway listening on port {}", config.gateway_port);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown::graceful_shutdown(config.shutdown_drain_secs))
        .await?;

    Ok(())
}
