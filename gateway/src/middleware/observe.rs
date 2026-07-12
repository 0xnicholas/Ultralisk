use std::time::Instant;

use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};
use metrics::{counter, histogram};
use uuid::Uuid;

use crate::types::RequestContext;

/// Outermost middleware: creates tracing span + request context + records Prometheus metrics.
pub async fn observe(mut request: Request, next: Next) -> Response {
    let request_id = Uuid::now_v7().to_string();
    let started_at = chrono::Utc::now();
    let method = request.method().to_string();
    let path = request.uri().path().to_string();
    // Normalize admin paths to avoid high cardinality: /v1/admin/models/123 → /v1/admin/*
    let metric_path = if path.starts_with("/v1/admin/") {
        "/v1/admin/*".to_string()
    } else {
        path.clone()
    };
    let start = Instant::now();

    request.extensions_mut().insert(RequestContext {
        request_id: request_id.clone(),
        started_at,
    });

    let span = tracing::info_span!(
        "request",
        request_id = %request_id,
        method = %method,
        path = %path,
    );
    let _guard = span.enter();

    tracing::info!("Request started");

    let response = next.run(request).await;

    let status = response.status();
    let duration = start.elapsed();

    counter!(
        "gateway_requests_total",
        "method" => method.clone(),
        "path" => metric_path.clone(),
        "status" => status.as_u16().to_string(),
    );
    histogram!(
        "gateway_request_duration_seconds",
        "method" => method,
        "path" => metric_path,
    )
    .record(duration.as_secs_f64());

    tracing::info!(
        status = %status,
        duration_ms = %duration.as_millis(),
        "Request completed"
    );

    response
}
