mod config;
mod error;
mod types;
mod db;
mod handlers;
mod auth;
mod app;

use config::AppConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info".into()))
        .json()
        .init();

    let config = AppConfig::from_env();
    let port = config.auth_port;
    tracing::info!("Starting Auth Service on port {}", port);

    let app = app::build(config).await?;

    let listener = tokio::net::TcpListener::bind(
        format!("0.0.0.0:{}", port)
    ).await?;
    tracing::info!("Auth Service listening on port {}", port);
    axum::serve(listener, app).await?;

    Ok(())
}
