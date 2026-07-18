use axum::{
    body::Bytes,
    response::{IntoResponse, Response},
};
use axum::response::sse::Sse;
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};

use crate::error::AppError;
use crate::types::{AuthResult, RouteInfo};
use metrics::{counter, histogram};

#[derive(Clone)]
pub struct ProxyState {
    pub http_client: reqwest::Client,
    pub timeout_secs: u64,
}

impl ProxyState {
    pub fn new(timeout_secs: u64) -> Self {
        Self {
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(timeout_secs))
                .build()
                .unwrap(),
            timeout_secs,
        }
    }
}

/// Handle /v1/chat/completions — non-streaming forward to vLLM
pub async fn handle_chat(
    state: &ProxyState,
    auth: &AuthResult,
    route: &RouteInfo,
    raw_body: Bytes,
    request_id: &str,
    started_at: chrono::DateTime<chrono::Utc>,
    pg_pool: Option<sqlx::PgPool>,
) -> Result<Response, AppError> {
    let upstream_url = format!("http://{}/v1/chat/completions", route.pod_address);

    let _upstream_start = std::time::Instant::now();
    let response = state
        .http_client
        .post(&upstream_url)
        .header("host", &route.pod_address)
        .header("content-type", "application/json")
        .body(raw_body)
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    counter!("gateway_upstream_requests_total",
        "model" => route.model_id.clone(),
        "pool" => route.pool_name.clone(),
        "status" => status.as_u16().to_string(),
    ).increment(1);
    histogram!("gateway_upstream_duration_seconds",
        "model" => route.model_id.clone(),
        "pool" => route.pool_name.clone(),
    ).record(_upstream_start.elapsed().as_secs_f64());

    // Extract usage from response (non-streaming path)
    if status.is_success() {
        if let Ok(usage_json) = serde_json::from_slice::<serde_json::Value>(&body) {
            if let Some(usage) = usage_json.get("usage") {
                let prompt_tokens = usage
                    .get("prompt_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let completion_tokens = usage
                    .get("completion_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                counter!("gateway_tokens_total",
                    "model" => route.model_id.clone(),
                    "direction" => "input",
                ).increment(prompt_tokens);
                counter!("gateway_tokens_total",
                    "model" => route.model_id.clone(),
                    "direction" => "output",
                ).increment(completion_tokens);
                tracing::info!(
                    prompt_tokens,
                    completion_tokens,
                    "Usage extracted from non-streaming response"
                );

                crate::proxy::usage_writer::spawn_usage_write(
                    pg_pool,
                    request_id.to_string(),
                    auth.api_key_id.clone(),
                    auth.user_id.clone(),
                    auth.org_id.clone(),
                    route.model_id.clone(),
                    prompt_tokens,
                    completion_tokens,
                    started_at,
                    "completed",
                );
            }
        }
    }

    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body))
        .map_err(|e| AppError::Internal(format!("Failed to build response: {}", e)))?)
}

const MAX_SSE_BUFFER: usize = 1024 * 1024;  // 1MB — drop connection if exceeded

/// Handle streaming SSE response from vLLM.
/// Uses a cumulative buffer to correctly parse SSE events split across TCP frames.
/// Forwards complete events to the client via an mpsc channel.
/// Extracts usage from the final SSE event containing the "usage" field.
pub async fn handle_chat_stream(
    state: &ProxyState,
    auth: &AuthResult,
    route: &RouteInfo,
    raw_body: Bytes,
    request_id: &str,
    started_at: chrono::DateTime<chrono::Utc>,
    pg_pool: Option<sqlx::PgPool>,
) -> Result<Response, AppError> {
    let upstream_url = format!("http://{}/v1/chat/completions", route.pod_address);

    let _upstream_start = std::time::Instant::now();
    let response = state
        .http_client
        .post(&upstream_url)
        .header("host", &route.pod_address)
        .header("content-type", "application/json")
        .body(raw_body)
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    counter!("gateway_upstream_requests_total",
        "model" => route.model_id.clone(),
        "pool" => route.pool_name.clone(),
        "status" => status.as_u16().to_string(),
    ).increment(1);

    if !status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        return Response::builder()
            .status(status)
            .body(axum::body::Body::from(body))
            .map_err(|e| AppError::Internal(format!("Failed to build response: {}", e)));
    }

    let byte_stream = response.bytes_stream();

    // Cumulative buffer for SSE parsing — events may span multiple TCP frames
    let buffer: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let usage_received = Arc::new(Mutex::new(false));
    let model_id = route.model_id.clone();
    let (tx, mut rx) = mpsc::channel::<String>(1024);  // bounded — prevents memory leak from slow clients
    let client_disconnected = Arc::new(Mutex::new(false));

    // Clone fields needed for usage write before the spawn moves them
    let api_key_id = auth.api_key_id.clone();
    let user_id = auth.user_id.clone();
    let org_id = auth.org_id.clone();
    let rq_id = request_id.to_string();
    let pg = pg_pool.clone();
    let model_id_for_panic = model_id.clone();  // clone for use after spawn moves model_id

    // Spawn background task to consume the upstream byte stream.
    // Store the JoinHandle so panics are detected and logged.
    let sse_handle = tokio::spawn({
        let buffer = buffer.clone();
        let usage_received = usage_received.clone();
        let client_disconnected = client_disconnected.clone();
        let api_key_id = api_key_id;
        let user_id = user_id;
        let org_id = org_id;
        let rq_id = rq_id;
        let pg = pg;
        let model_id = model_id;
        async move {
            let mut byte_stream = byte_stream;
            while let Some(chunk_result) = byte_stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let mut buf = buffer.lock().await;
                        buf.extend_from_slice(&bytes);
                        // Safety: drop connection if buffer exceeds limit (malformed upstream)
                        if buf.len() > MAX_SSE_BUFFER {
                            tracing::error!("SSE buffer exceeded {} bytes, dropping connection", MAX_SSE_BUFFER);
                            return;
                        }
                        while let Some(pos) = find_sse_boundary(&buf) {
                            let event_bytes = buf.drain(..pos + 2).collect::<Vec<_>>();
                            let event_str = String::from_utf8_lossy(&event_bytes).to_string();
                            if event_str.contains("\"usage\"") {
                                if let Ok(value) =
                                    serde_json::from_str::<serde_json::Value>(event_str.trim())
                                {
                                    if value.get("usage").is_some() {
                                        *usage_received.lock().await = true;
                                        let pt = value["usage"]["prompt_tokens"].as_u64().unwrap_or(0);
                                        let ct = value["usage"]["completion_tokens"].as_u64().unwrap_or(0);
                                        crate::proxy::usage_writer::spawn_usage_write(
                                            pg.clone(),
                                            rq_id.clone(),
                                            api_key_id.clone(),
                                            user_id.clone(),
                                            org_id.clone(),
                                            model_id.clone(),
                                            pt,
                                            ct,
                                            started_at,
                                            "completed",
                                        );
                                        tracing::info!("Usage extracted from SSE stream");
                                    }
                                }
                            }
                            if tx.send(event_str).await.is_err() {
                                // Client disconnected — stop sending
                                *client_disconnected.lock().await = true;
                                return;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!(?e, "SSE stream error");
                        break;
                    }
                }
            }
            // After stream ends, check if usage was received
            let got_usage = *usage_received.lock().await;
            let cancelled = *client_disconnected.lock().await;
            if cancelled && !got_usage {
                metrics::counter!(
                    "gateway_cancelled_without_usage_total",
                    "model" => model_id.clone()
                ).increment(1);
                tracing::warn!("Client disconnected before usage received");
            } else if !got_usage {
                metrics::counter!(
                    "gateway_missing_usage_total",
                    "model" => model_id.clone()
                ).increment(1);
                tracing::warn!("SSE stream ended without usage data");
            }
        }
    });

    // Monitor the SSE task for panics
    tokio::spawn(async move {
        match sse_handle.await {
            Ok(()) => {} // normal completion
            Err(e) => {
                tracing::error!(
                    error = %e,
                    model = %model_id_for_panic,
                    "SSE background task panicked"
                );
                metrics::counter!("gateway_sse_panics_total", "model" => model_id_for_panic).increment(1);
            }
        }
    });

    // Return SSE response to client
    let sse_stream = async_stream::stream! {
        while let Some(event) = rx.recv().await {
            yield Ok::<_, std::convert::Infallible>(axum::response::sse::Event::default().data(event));
        }
    };

    Ok(Sse::new(sse_stream).into_response())
}

/// Find the index of the first `\n\n` (SSE event boundary) in the buffer.
fn find_sse_boundary(buf: &[u8]) -> Option<usize> {
    buf.windows(2).position(|w| w == b"\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_boundary_simple() {
        let data = b"data: hello\n\n";
        assert_eq!(find_sse_boundary(data), Some(11));
    }

    #[test]
    fn test_find_boundary_not_found() {
        let data = b"data: hello";
        assert_eq!(find_sse_boundary(data), None);
    }

    #[test]
    fn test_find_boundary_middle_of_buffer() {
        let data = b"data: first\n\ndata: second\n\n";
        assert_eq!(find_sse_boundary(data), Some(11));
    }

    #[test]
    fn test_find_boundary_empty_buffer() {
        let data: &[u8] = b"";
        assert_eq!(find_sse_boundary(data), None);
    }
}
