use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Extension, Path, State},
    middleware,
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use redis::aio::MultiplexedConnection;
use serde::Deserialize;
use tower_http::limit::RequestBodyLimitLayer;
use sqlx::postgres::PgPoolOptions;

use crate::batch::BatchAggregator;
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

#[derive(Clone)]
pub struct AppState {
    pub redis: MultiplexedConnection,
    pub proxy: ProxyState,
    pub admin_proxy: AdminProxyState,
    pub config: AppConfig,
    pub pg_pool: Option<sqlx::PgPool>,
    pub batch_aggregator: Arc<BatchAggregator>,
}

pub async fn build(config: AppConfig) -> anyhow::Result<Router> {
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis_conn = redis_client.get_multiplexed_async_connection().await?;

    // Start revocation subscriber (ADR-008: Pub/Sub-based cache invalidation)
    let revocation_handle = crate::revocation::start_subscriber(
        redis_conn.clone(),
        config.redis_url.clone(),
    ).await?;

    let rt = table::load_route_table(&config.route_table_path);
    ROUTE_TABLE.store(Arc::new(rt));
    tracing::info!("Route table loaded from {}", config.route_table_path);

    let auth_state = AuthState::new(&config, redis_conn.clone());
    let proxy_state = ProxyState::new(config.upstream_timeout_secs);
    let admin_proxy_state = AdminProxyState::new(&config);

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

    let batch_aggregator = BatchAggregator::new(
        config.batch_window_secs,
        config.batch_max_requests,
        proxy_state.clone(),
        pg_pool.clone(),
    );

    let app_state = AppState {
        redis: redis_conn.clone(),
        proxy: proxy_state,
        admin_proxy: admin_proxy_state,
        config: config.clone(),
        pg_pool,
        batch_aggregator,
    };

    let recorder = metrics_exporter_prometheus::PrometheusBuilder::new().build_recorder();
    let metrics_handle = recorder.handle();
    static METRICS_INIT: std::sync::Once = std::sync::Once::new();
    METRICS_INIT.call_once(|| {
        metrics::set_global_recorder(recorder).expect("Failed to set metrics recorder");
    });

    let chat_router = Router::new()
        .route("/v1/chat/completions", post(chat_handler))
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            auth_state.clone(),
            auth::authenticate,
        ));

    let admin_public = Router::new()
        .route("/v1/admin/auth/login", post(public_admin_handler))
        .route("/v1/admin/auth/logout", post(public_admin_handler))
        .with_state(app_state.clone());

    let admin_protected = Router::new()
        .route("/v1/admin/models/{model_id}/warmup", post(warmup_handler))
        .route("/v1/admin/{*path}", any(admin_handler))
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            auth_state.clone(),
            auth::authenticate,
        ));

    let admin_router = admin_public.merge(admin_protected);

    // Internal endpoints (no auth — for KAI Scheduler callbacks)
    let internal_router = Router::new()
        .route("/v1/internal/models/{model_id}/ready", post(model_ready_handler))
        .with_state(app_state.clone());

    let infra_router = Router::new()
        .route("/health", get(health::health))
        .route("/ready", get({
            let redis = redis_conn.clone();
            move || health::ready(
                axum::extract::State(redis.clone()),
                State(()),
            )
        }))
        .route("/metrics", get(move || {
            let handle = metrics_handle.clone();
            async move { handle.render() }
        }));

    let app = Router::new()
        .merge(chat_router)
        .merge(admin_router)
        .merge(internal_router)
        .merge(infra_router)
        .layer(middleware::from_fn(observe::observe))
        .layer(RequestBodyLimitLayer::new(config.max_body_size));

    Ok(app)
}

// --- Chat handlers ---

async fn chat_handler(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthResult>,
    chat_extractor: ChatRequestExtractor,
) -> Result<Response, AppError> {
    // 1. Route resolution (with cold start retry on empty pool)
    let route_info = resolve_with_cold_start(
        &state,
        &chat_extractor.request.model,
    ).await?;

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

    let request_id = uuid::Uuid::now_v7().to_string();
    let started_at = chrono::Utc::now();

    // 3. Strategy-based routing
    match route_info.strategy.as_str() {
        "batch" => {
            state.batch_aggregator
                .enqueue(route_info, auth, chat_extractor.raw_body, request_id, started_at)
                .await
        }
        _ => {
            // serverless (default): immediate forward
            if chat_extractor.request.stream {
                chat::handle_chat_stream(
                    &state.proxy, &auth, &route_info, chat_extractor.raw_body,
                    &request_id, started_at, state.pg_pool.clone(),
                ).await
            } else {
                chat::handle_chat(
                    &state.proxy, &auth, &route_info, chat_extractor.raw_body,
                    &request_id, started_at, state.pg_pool.clone(),
                ).await
            }
        }
    }
}

/// Resolve model → route_info, with cold start fallback for empty pools.
/// Phase 1 M3: When pool is empty, enqueue in cold start queue, trigger KAI,
/// wait for model ready, then re-resolve.
async fn resolve_with_cold_start(
    state: &AppState,
    model_id: &str,
) -> Result<crate::types::RouteInfo, AppError> {
    match resolver::resolve(model_id) {
        Ok(route) => return Ok(route),
        Err((status, _)) if status.as_u16() == 503 => {
            // Pool is empty — cold start path
            tracing::info!(model_id = %model_id, "Pool empty, entering cold start path");
            metrics::counter!("gateway_cold_starts_total", "model" => model_id.to_string()).increment(1);

            let timeout = Duration::from_secs(state.config.cold_start_timeout_secs);

            // Trigger KAI Scheduler (fire-and-forget, best-effort)
            let kai_url = state.config.kai_scheduler_url.clone();
            let model_id_c = model_id.to_string();
            tokio::spawn(async move {
                match crate::cold_start::trigger_kai_provision(
                    &kai_url, &model_id_c, 1, "H100",
                ).await {
                    Ok(()) => {}
                    Err(e) => {
                        tracing::warn!(model_id = %model_id_c, error = %e, "KAI provision trigger failed (non-fatal)");
                    }
                }
            });

            // Wait for cold start to complete (with timeout)
            crate::cold_start::COLD_START_QUEUES
                .wait_for_ready(model_id, timeout)
                .await?;

            // Re-resolve — if still empty, KAI didn't provision in time
            resolver::resolve(model_id).map_err(|(status, _code)| {
                match status.as_u16() {
                    404 => AppError::ModelNotFound(model_id.to_string()),
                    503 => AppError::ColdStartTimeout,
                    _ => AppError::ModelNotAvailable(model_id.to_string()),
                }
            })
        }
        Err((status, _)) if status.as_u16() == 404 => {
            Err(AppError::ModelNotFound(model_id.to_string()))
        }
        Err(_) => Err(AppError::ModelNotAvailable(model_id.to_string())),
    }
}

// --- Admin handlers ---

async fn admin_handler(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthResult>,
    request: axum::extract::Request,
) -> Result<Response, AppError> {
    admin::handle_admin(&state.admin_proxy, &auth, request).await
}

async fn public_admin_handler(
    State(state): State<AppState>,
    request: axum::extract::Request,
) -> Result<Response, AppError> {
    admin::handle_admin_public(&state.admin_proxy, request).await
}

// --- Internal handlers ---

/// KAI Scheduler callback: notifies the Gateway that a model is ready.
/// KAI calls this after successfully provisioning a GPU worker for the model.
/// The body should include the pod address so we can update the route table.
#[derive(Debug, Deserialize)]
struct ModelReadyRequest {
    pod_id: String,
    pod_address: String,
    #[serde(default)]
    gpu_count: Option<u32>,
}

async fn model_ready_handler(
    Path(model_id): Path<String>,
    Json(body): Json<ModelReadyRequest>,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!(
        model_id = %model_id,
        pod_id = %body.pod_id,
        pod_address = %body.pod_address,
        "KAI callback: model ready"
    );

    // Update route table dynamically
    table::upsert_pod(&model_id, "kai-provisioned", "serverless", &body.pod_id, &body.pod_address);

    // Notify cold start waiters
    crate::cold_start::COLD_START_QUEUES.notify_ready(&model_id).await;

    Ok(Json(serde_json::json!({"status": "ok", "model_id": model_id})))
}

// --- Warmup handler ---

/// Admin endpoint to pre-warm a model. Triggers KAI Scheduler to provision GPU.
/// Returns 202 (Accepted) — the caller should poll until the model is ready.
async fn warmup_handler(
    State(state): State<AppState>,
    Extension(_auth): Extension<AuthResult>,
    Path(model_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    // Check if already in route table with at least one pod
    let already_ready = resolver::resolve(&model_id).is_ok();

    if already_ready {
        return Ok((axum::http::StatusCode::OK,
            Json(serde_json::json!({"status": "already_ready", "model_id": model_id})))
        );
    }

    // Trigger KAI Scheduler
    match crate::cold_start::trigger_kai_provision(
        &state.config.kai_scheduler_url, &model_id, 1, "H100",
    ).await {
        Ok(()) => {
            Ok((axum::http::StatusCode::ACCEPTED,
                Json(serde_json::json!({"status": "provisioning", "model_id": model_id})))
            )
        }
        Err(e) => {
            Err(AppError::Internal(format!("KAI provision failed: {}", e)))
        }
    }
}
