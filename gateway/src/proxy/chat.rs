use axum::{
    body::Bytes,
    extract::State,
    response::{IntoResponse, Response},
};

use crate::error::AppError;
use crate::extract::chat_request::ChatRequestExtractor;
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
