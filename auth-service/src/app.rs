use axum::{Router, routing::{get, post}};
use axum::extract::FromRef;
use sqlx::PgPool;
use tower_http::limit::RequestBodyLimitLayer;
use crate::config::AppConfig;
use crate::handlers;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
    pub brute_force: handlers::login::BruteForceMap,
    pub refresh_tokens: handlers::refresh::RefreshTokenStore,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> Self { state.pool.clone() }
}
impl FromRef<AppState> for String {
    fn from_ref(state: &AppState) -> Self { state.jwt_secret.clone() }
}
impl FromRef<AppState> for handlers::login::BruteForceMap {
    fn from_ref(state: &AppState) -> Self { state.brute_force.clone() }
}
impl FromRef<AppState> for handlers::refresh::RefreshTokenStore {
    fn from_ref(state: &AppState) -> Self { state.refresh_tokens.clone() }
}

pub async fn build(config: AppConfig) -> anyhow::Result<Router> {
    let pool = PgPool::connect(&config.database_url).await?;
    crate::db::migrate(&pool).await?;

    let recorder = metrics_exporter_prometheus::PrometheusBuilder::new().build_recorder();
    let metrics_handle = recorder.handle();
    static METRICS_INIT: std::sync::Once = std::sync::Once::new();
    METRICS_INIT.call_once(|| {
        metrics::set_global_recorder(recorder).expect("Failed to set metrics recorder");
    });

    let state = AppState {
        pool,
        jwt_secret: config.jwt_secret.clone(),
        brute_force: std::sync::Arc::new(dashmap::DashMap::new()),
        refresh_tokens: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
    };

    let app = Router::new()
        .route("/validate-key", post(handlers::validate_key::handler))
        .route("/login", post(handlers::login::handler))
        .route("/refresh", post(handlers::refresh::handler))
        .route("/keys", post(handlers::keys::handler))
        .route("/me", get(handlers::me::handler))
        .route("/health", get(|| async { "OK" }))
        .route("/metrics", get(move || {
            let handle = metrics_handle.clone();
            async move { handle.render() }
        }))
        .with_state(state)
        .layer(RequestBodyLimitLayer::new(10 * 1024));

    Ok(app)
}
