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
) -> Result<Response, AppError> {
    let upstream_url = format!("http://{}/v1/chat/completions", route.pod_address);

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
                tracing::info!(
                    prompt_tokens,
                    completion_tokens,
                    "Usage extracted from non-streaming response"
                );
            }
        }
    }

    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body))
        .unwrap())
}

/// Handle streaming SSE response from vLLM.
/// Uses a cumulative buffer to correctly parse SSE events split across TCP frames.
/// Forwards complete events to the client via an mpsc channel.
/// Extracts usage from the final SSE event containing the "usage" field.
pub async fn handle_chat_stream(
    state: &ProxyState,
    auth: &AuthResult,
    route: &RouteInfo,
    raw_body: Bytes,
) -> Result<Response, AppError> {
    let upstream_url = format!("http://{}/v1/chat/completions", route.pod_address);

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
    if !status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        return Ok(Response::builder()
            .status(status)
            .body(axum::body::Body::from(body))
            .unwrap());
    }

    let byte_stream = response.bytes_stream();

    // Cumulative buffer for SSE parsing — events may span multiple TCP frames
    let buffer: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let usage_received = Arc::new(Mutex::new(false));
    let model_id = route.model_id.clone();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Spawn background task to consume the upstream byte stream
    tokio::spawn({
        let buffer = buffer.clone();
        let usage_received = usage_received.clone();
        async move {
            let mut byte_stream = byte_stream;
            while let Some(chunk_result) = byte_stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let mut buf = buffer.lock().await;
                        buf.extend_from_slice(&bytes);
                        // Split on double-newline (SSE event boundary)
                        while let Some(pos) = find_sse_boundary(&buf) {
                            let event_bytes = buf.drain(..pos + 2).collect::<Vec<_>>();
                            let event_str = String::from_utf8_lossy(&event_bytes).to_string();
                            // Check for usage in this event
                            if event_str.contains("\"usage\"") {
                                if let Ok(value) =
                                    serde_json::from_str::<serde_json::Value>(event_str.trim())
                                {
                                    if value.get("usage").is_some() {
                                        *usage_received.lock().await = true;
                                        tracing::info!("Usage extracted from SSE stream");
                                    }
                                }
                            }
                            let _ = tx.send(event_str);
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
            if !got_usage {
                metrics::counter!(
                    "gateway_missing_usage_total",
                    "model" => model_id.clone()
                )
                .increment(1);
                tracing::warn!("SSE stream ended without usage data");
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
