use axum::{
    body::Bytes,
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};

use crate::types::ChatRequest;

/// Extracts ChatRequest from the request body, caching raw Bytes for downstream proxy.
/// On success, stores both `ChatRequest` and raw `Bytes` in request extensions.
pub struct ChatRequestExtractor {
    pub request: ChatRequest,
    pub raw_body: Bytes,
}

impl<S> FromRequest<S> for ChatRequestExtractor
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let (parts, body) = req.into_parts();

        let bytes = Bytes::from_request(Request::from_parts(parts, body), state)
            .await
            .map_err(|e| {
                (StatusCode::BAD_REQUEST, format!("Failed to read body: {}", e)).into_response()
            })?;

        let request: ChatRequest = serde_json::from_slice(&bytes).map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Invalid JSON: {}", e)).into_response()
        })?;

        if request.model.is_empty() {
            return Err(
                (StatusCode::BAD_REQUEST, "Model field is required").into_response(),
            );
        }

        Ok(ChatRequestExtractor {
            request,
            raw_body: bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request as HttpRequest;

    #[tokio::test]
    async fn test_valid_chat_request() {
        let body =
            Body::from(r#"{"model":"llama-8b","messages":[{"role":"user","content":"hi"}]}"#);
        let req = HttpRequest::builder().body(body).unwrap();

        let extractor = ChatRequestExtractor::from_request(req, &()).await.unwrap();
        assert_eq!(extractor.request.model, "llama-8b");
        assert_eq!(extractor.request.messages.len(), 1);
        assert!(!extractor.request.stream); // default
        assert!(!extractor.raw_body.is_empty());
    }

    #[tokio::test]
    async fn test_invalid_json_rejects() {
        let body = Body::from("not json");
        let req = HttpRequest::builder().body(body).unwrap();
        let result = ChatRequestExtractor::from_request(req, &()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_missing_model_rejects() {
        let body = Body::from(r#"{"messages":[{"role":"user","content":"hi"}]}"#);
        let req = HttpRequest::builder().body(body).unwrap();
        let result = ChatRequestExtractor::from_request(req, &()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_stream_defaults_to_false() {
        let body =
            Body::from(r#"{"model":"llama-8b","messages":[{"role":"user","content":"hi"}]}"#);
        let req = HttpRequest::builder().body(body).unwrap();
        let extractor = ChatRequestExtractor::from_request(req, &()).await.unwrap();
        assert!(!extractor.request.stream);
    }

    #[tokio::test]
    async fn test_stream_explicitly_true() {
        let body = Body::from(
            r#"{"model":"llama-8b","messages":[{"role":"user","content":"hi"}],"stream":true}"#,
        );
        let req = HttpRequest::builder().body(body).unwrap();
        let extractor = ChatRequestExtractor::from_request(req, &()).await.unwrap();
        assert!(extractor.request.stream);
    }
}
