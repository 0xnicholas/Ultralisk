use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid API key")]
    InvalidApiKey,
    #[error("API key revoked")]
    RevokedApiKey,
    #[error("Rate limit exceeded")]
    RateLimitExceeded { retry_after: u64 },
    #[error("Model not found: {0}")]
    ModelNotFound(String),
    #[error("Model not available: {0}")]
    ModelNotAvailable(String),
    #[error("Model cold starting")]
    ColdStarting,
    #[error("Cold start timed out")]
    ColdStartTimeout,
    #[error("Upstream error: {0}")]
    UpstreamError(String),
    #[error("Upstream timeout")]
    UpstreamTimeout,
    #[error("Invalid request: {0}")]
    InvalidRequest(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after: Option<u64>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, retry_after) = match &self {
            AppError::InvalidApiKey => (StatusCode::UNAUTHORIZED, "invalid_api_key", None),
            AppError::RevokedApiKey => (StatusCode::UNAUTHORIZED, "revoked_api_key", None),
            AppError::RateLimitExceeded { retry_after } => {
                (StatusCode::TOO_MANY_REQUESTS, "rate_limit_exceeded", Some(*retry_after))
            }
            AppError::ModelNotFound(_) => (StatusCode::NOT_FOUND, "model_not_found", None),
            AppError::ModelNotAvailable(_) => {
                (StatusCode::SERVICE_UNAVAILABLE, "model_not_available", None)
            }
            AppError::ColdStarting => {
                (StatusCode::ACCEPTED, "cold_starting", None)
            }
            AppError::ColdStartTimeout => {
                (StatusCode::SERVICE_UNAVAILABLE, "cold_start_timeout", None)
            }
            AppError::UpstreamError(_) => (StatusCode::BAD_GATEWAY, "upstream_error", None),
            AppError::UpstreamTimeout => (StatusCode::GATEWAY_TIMEOUT, "upstream_timeout", None),
            AppError::InvalidRequest(_) => (StatusCode::BAD_REQUEST, "invalid_request", None),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", None),
        };

        let body = ErrorBody {
            error: ErrorDetail {
                code: code.to_string(),
                message: self.to_string(),
                retry_after,
            },
        };

        (status, Json(body)).into_response()
    }
}
