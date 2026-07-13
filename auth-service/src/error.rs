use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid credentials")]
    InvalidCredentials,
    #[error("API key not found")]
    ApiKeyNotFound,
    #[error("API key revoked")]
    ApiKeyRevoked,
    #[error("Invalid or expired token")]
    InvalidToken,
    #[error("Account locked due to too many login attempts")]
    AccountLocked { retry_after_secs: u64 },
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "invalid_credentials"),
            AppError::ApiKeyNotFound => (StatusCode::NOT_FOUND, "api_key_not_found"),
            AppError::ApiKeyRevoked => (StatusCode::OK, "api_key_revoked"),
            AppError::InvalidToken => (StatusCode::UNAUTHORIZED, "invalid_token"),
            AppError::AccountLocked { .. } => (StatusCode::TOO_MANY_REQUESTS, "account_locked"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };
        let body = ErrorBody { error: message.to_string() };
        (status, Json(body)).into_response()
    }
}
