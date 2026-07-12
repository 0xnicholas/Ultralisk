mod config;
mod error;
mod health;
mod types;
mod route;

// Stub modules — will be implemented in later tasks
// mod middleware { pub mod auth; pub mod observe; }
// mod extract { pub mod chat_request; }
// mod route { pub mod table; pub mod resolver; }
// mod rate_limit;
// mod proxy { pub mod chat; pub mod admin; pub mod usage_writer; }
// mod shutdown;
// mod app;

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

    tracing::info!("Gateway scaffold ready — app::build not wired yet");

    Ok(())
}
