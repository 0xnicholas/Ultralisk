use std::sync::Arc;

use axum::{
    extract::{Extension, State},
    middleware,
    response::Response,
    routing::{any, get, post},
    Router,
};
use redis::aio::MultiplexedConnection;
use tower_http::limit::RequestBodyLimitLayer;
use sqlx::postgres::PgPoolOptions;

use crate::config::AppConfig;
use crate::error::AppError;
use crate::extract::chat_request::ChatRequestExtractor;
use crate::health;
use crate::middleware::auth::{self, AuthState};
use crate::middleware::observe;
use crate::proxy::admin::{self, AdminProxyState};
use crate::proxy::chat::{self, ProxyState};
use crate::rate_limit;
use crate::route::resolver;
use crate::route::table::{self, ROUTE_TABLE};
use crate::types::AuthResult;

/// Shared application state passed to all handlers
#[derive(Clone)]
pub struct AppState {
    pub redis: MultiplexedConnection,
    pub proxy: ProxyState,
    pub admin_proxy: AdminProxyState,
    pub config: AppConfig,
    pub pg_pool: Option<sqlx::PgPool>,
}

pub async fn build(config: AppConfig) -> anyhow::Result<Router> {
    // Redis
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis_conn = redis_client.get_multiplexed_async_connection().await?;

    // Load route table synchronously before server starts
    let rt = table::load_route_table(&config.route_table_path);
    ROUTE_TABLE.store(Arc::new(rt));
    tracing::info!("Route table loaded from {}", config.route_table_path);

    // States
    let auth_state = AuthState::new(&config, redis_conn.clone());
    let proxy_state = ProxyState::new(config.upstream_timeout_secs);
    let admin_proxy_state = AdminProxyState::new(&config);

    // Optional PG pool for usage writes (non-blocking if unavailable)
    let pg_pool = match PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
    {
        Ok(pool) => {
            tracing::info!("Connected to PostgreSQL for usage writes");
            Some(pool)
        }
        Err(e) => {
            tracing::warn!("Failed to connect to PostgreSQL: {}. Usage writes disabled.", e);
            None
        }
    };

    let app_state = AppState {
        redis: redis_conn.clone(),
        proxy: proxy_state,
        admin_proxy: admin_proxy_state,
        config: config.clone(),
        pg_pool,
    };

    // Prometheus metrics
    let recorder = metrics_exporter_prometheus::PrometheusBuilder::new().build_recorder();
    let metrics_handle = recorder.handle();
    // Only set once — subsequent calls (e.g., in tests) are no-ops
    static METRICS_INIT: std::sync::Once = std::sync::Once::new();
    METRICS_INIT.call_once(|| {
        metrics::set_global_recorder(recorder).expect("Failed to set metrics recorder");
    });

    // --- Routes ---

    // Chat completions
    let chat_router = Router::new()
        .route("/v1/chat/completions", post(chat_handler))
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            auth_state.clone(),
            auth::authenticate,
        ));

    // Admin
    let admin_router = Router::new()
        .route("/v1/admin/{*path}", any(admin_handler))
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            auth_state,
            auth::authenticate,
        ));

    // Health + metrics (no auth)
    let infra_router = Router::new()
        .route("/health", get(health::health))
        .route("/ready", get({
            let redis = redis_conn.clone();
            move || health::ready(
                axum::extract::State(redis.clone()),
                State(()) /* route table checked directly in handler */,
            )
        }))
        .route("/metrics", get(move || {
            let handle = metrics_handle.clone();
            async move { handle.render() }
        }));

    let app = Router::new()
        .merge(chat_router)
        .merge(admin_router)
        .merge(infra_router)
        .layer(middleware::from_fn(observe::observe))
        .layer(RequestBodyLimitLayer::new(config.max_body_size));

    Ok(app)
}

// --- Handlers ---

async fn chat_handler(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthResult>,
    chat_extractor: ChatRequestExtractor,
) -> Result<Response, AppError> {
    // 1. Route resolution
    let route_info = resolver::resolve(&chat_extractor.request.model).map_err(|(status, code)| {
        match status.as_u16() {
            404 => AppError::ModelNotFound(chat_extractor.request.model.clone()),
            _ => AppError::ModelNotAvailable(chat_extractor.request.model.clone()),
        }
    })?;

    // 2. Rate limit check
    let quota = auth
        .quota_limits
        .get(&chat_extractor.request.model)
        .or_else(|| auth.quota_limits.get("*"))
        .copied();

    let input_text: String = chat_extractor
        .request
        .messages
        .iter()
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join(" ");

    let estimated = rate_limit::estimate_tokens(&input_text, chat_extractor.request.max_tokens);

    if state.config.rate_limit_enabled {
        rate_limit::check(
            &state.redis,
            &auth.api_key_id,
            &chat_extractor.request.model,
            quota,
            state.config.rate_limit_window_secs,
            estimated,
        )
        .await?;
    }

    // 3. Proxy to vLLM — branch on streaming vs non-streaming
    let request_id = uuid::Uuid::now_v7().to_string();
    let started_at = chrono::Utc::now();

    let result = if chat_extractor.request.stream {
        chat::handle_chat_stream(
            &state.proxy, &auth, &route_info, chat_extractor.raw_body,
            &request_id, started_at, state.pg_pool.clone(),
        ).await
    } else {
        chat::handle_chat(
            &state.proxy, &auth, &route_info, chat_extractor.raw_body,
            &request_id, started_at, state.pg_pool.clone(),
        ).await
    };

    Ok(result?)
}

async fn admin_handler(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthResult>,
    request: axum::extract::Request,
) -> Result<Response, AppError> {
    admin::handle_admin(&state.admin_proxy, &auth, request).await
}
