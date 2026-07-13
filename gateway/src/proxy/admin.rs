use axum::{
    body::Body,
    extract::{Request, State},
    response::{IntoResponse, Response},
};

use crate::config::AppConfig;
use crate::error::AppError;
use crate::types::AuthResult;

#[derive(Clone)]
pub struct AdminProxyState {
    pub http_client: reqwest::Client,
    pub console_api_url: String,
    pub max_body_size: usize,
}

impl AdminProxyState {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(config.admin_upstream_timeout_secs))
                .build()
                .unwrap(),
            console_api_url: config.console_api_url.clone(),
            max_body_size: config.max_body_size,
        }
    }
}

/// Proxy /v1/admin/* to Console API with header sanitization.
pub async fn handle_admin(
    state: &AdminProxyState,
    auth: &AuthResult,
    request: Request,
) -> Result<Response, AppError> {
    let path = request
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let upstream_url = format!("{}{}", state.console_api_url.trim_end_matches('/'), path);

    // Read request body
    let (parts, body) = request.into_parts();
    let body_bytes = axum::body::to_bytes(body, state.max_body_size)
        .await
        .map_err(|e| AppError::InvalidRequest(format!("Body too large: {}", e)))?;

    // Build forwarding request — copy method and all headers except internal ones
    let mut req_builder = state
        .http_client
        .request(parts.method, &upstream_url)
        .header("x-user-id", &auth.user_id)
        .header("x-org-id", &auth.org_id)
        .header("x-api-key-id", &auth.api_key_id);

    for (name, value) in parts.headers.iter() {
        let lower = name.as_str().to_lowercase();
        if lower != "host" && lower != "x-user-id" && lower != "x-org-id" && lower != "x-api-key-id"
        {
            req_builder = req_builder.header(name.as_str(), value.as_bytes());
        }
    }

    let response = req_builder
        .body(body_bytes)
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    let resp_body = response
        .bytes()
        .await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(resp_body))
        .map_err(|e| AppError::Internal(format!("Failed to build response: {}", e)))?)
}

/// Public admin proxy — no auth required (for login/logout).
/// Forwards request without injecting user context headers.
pub async fn handle_admin_public(
    state: &AdminProxyState,
    request: axum::extract::Request,
) -> Result<Response, AppError> {
    let path = request.uri().path_and_query()
        .map(|pq| pq.as_str()).unwrap_or("/");
    let upstream_url = format!("{}{}", state.console_api_url.trim_end_matches('/'), path);

    let (parts, body) = request.into_parts();
    let body_bytes = axum::body::to_bytes(body, state.max_body_size)
        .await
        .map_err(|e| AppError::InvalidRequest(format!("Body too large: {}", e)))?;

    let mut req_builder = state.http_client
        .request(parts.method.clone(), &upstream_url);

    for (name, value) in parts.headers.iter() {
        let lower = name.as_str().to_lowercase();
        if lower != "host" {
            req_builder = req_builder.header(name.as_str(), value.as_bytes());
        }
    }

    let response = req_builder.body(body_bytes).send().await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    let status = response.status();
    let resp_body = response.bytes().await
        .map_err(|e| AppError::UpstreamError(e.to_string()))?;

    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(resp_body))
        .map_err(|e| AppError::Internal(format!("Failed to build response: {}", e)))?)
}
