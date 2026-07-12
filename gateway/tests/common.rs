use std::sync::Arc;
use axum::{
    body::Body,
    http::StatusCode,
    response::IntoResponse,
    routing::{any, post},
    Router,
};
use std::net::SocketAddr;
use std::process::Command;
use tempfile::NamedTempFile;
use std::io::Write;
use testcontainers::runners::AsyncRunner;

/// Start a mock vLLM server. Returns (base_url, shutdown_handle).
pub async fn start_mock_vllm() -> (String, tokio::task::JoinHandle<()>) {
    let app = Router::new()
        .route("/v1/chat/completions", post(|axum::extract::Json(body): axum::extract::Json<serde_json::Value>| async move {
            let stream = body.get("stream").and_then(|v| v.as_bool()).unwrap_or(false);
            if stream {
                // Streaming: return SSE events
                let events = r#"data: {"id":"cmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"cmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"cmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"!"}}]}

data: {"id":"cmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":3,"total_tokens":13}}

data: [DONE]

"#;
                (
                    StatusCode::OK,
                    [("content-type", "text/event-stream")],
                    Body::from(events),
                ).into_response()
            } else {
                // Non-streaming: JSON with usage
                axum::Json(serde_json::json!({
                    "id": "cmpl-001",
                    "object": "chat.completion",
                    "created": 1234567890,
                    "model": "llama-8b",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": "Hello! How can I help you?"},
                        "finish_reason": "stop"
                    }],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18}
                })).into_response()
            }
        }));

    start_server(app).await
}

/// Start a mock Auth Service. Returns (base_url, shutdown_handle).
/// Supports pre-configured keys.
pub async fn start_mock_auth_service() -> (String, tokio::task::JoinHandle<()>) {
    let app = Router::new()
        .route("/validate-key", post(|axum::extract::Json(body): axum::extract::Json<serde_json::Value>| async move {
            let api_key = body.get("api_key").and_then(|v| v.as_str()).unwrap_or("");
            match api_key {
                "ultr_valid" => axum::Json(serde_json::json!({
                    "user_id": "usr_test",
                    "org_id": "org_test",
                    "status": "active",
                    "quota_limits": {
                        "llama-3.1-8b-instruct": 1000000,
                        "nonexistent-model": 1000,
                        "*": 50000
                    }
                })).into_response(),
                "ultr_revoked" => axum::Json(serde_json::json!({
                    "user_id": "usr_revoked",
                    "org_id": "org_test",
                    "status": "revoked",
                    "quota_limits": {}
                })).into_response(),
                _ => (StatusCode::NOT_FOUND, axum::Json(serde_json::json!({"error": "not_found"}))).into_response(),
            }
        }));

    start_server(app).await
}

/// Start a mock Console API. Returns (base_url, shutdown_handle).
pub async fn start_mock_console_api() -> (String, tokio::task::JoinHandle<()>) {
    let app = Router::new()
        .route("/v1/admin/{*path}", any(
            |axum::extract::Path(path): axum::extract::Path<String>,
             headers: axum::http::HeaderMap,
             method: axum::http::Method,
             body: axum::body::Bytes| async move {
                let received_user = headers
                    .get("x-user-id")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("missing")
                    .to_string();

                let response_body = serde_json::json!({
                    "echo": {
                        "path": path,
                        "method": method.to_string(),
                        "received_user_id": received_user,
                        "body_size": body.len()
                    }
                });

                axum::Json(response_body).into_response()
            }
        ));

    start_server(app).await
}

/// Start an axum server on a random port. Returns (base_url, shutdown_handle).
async fn start_server(app: Router) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{}", addr);

    let handle = tokio::spawn(async move {
        axum::serve(listener, app.into_make_service())
            .await
            .unwrap();
    });

    // Give the server a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    (base_url, handle)
}

/// Start Redis via testcontainers. Returns (redis_url, container handle).
/// The container will be dropped when the handle is dropped, stopping Redis.
pub async fn start_redis() -> (String, testcontainers::ContainerAsync<testcontainers_modules::redis::Redis>) {
    let container = testcontainers_modules::redis::Redis::default()
        .start()
        .await
        .expect("Failed to start Redis container");
    let port = container.get_host_port_ipv4(6379).await.unwrap();
    let url = format!("redis://127.0.0.1:{}", port);
    (url, container)
}

/// Write a temporary route table JSON file. Returns the path.
pub fn write_temp_route_table(pods: &[(&str, &str)]) -> String {
    let pods_json: Vec<serde_json::Value> = pods
        .iter()
        .map(|(id, addr)| {
            serde_json::json!({
                "id": id,
                "address": addr,
                "weight": 1
            })
        })
        .collect();

    let config = serde_json::json!({
        "version": 1,
        "routes": {
            "llama-3.1-8b-instruct": {
                "name": "test-pool",
                "strategy": "serverless",
                "pods": pods_json
            }
        }
    });

    let mut file = NamedTempFile::new().unwrap();
    file.write_all(serde_json::to_string_pretty(&config).unwrap().as_bytes()).unwrap();
    let path = file.into_temp_path();
    let path_str = path.to_str().unwrap().to_string();
    // Keep the temp file alive by leaking the path
    std::mem::forget(path);
    path_str
}

/// Check if Redis is available on common ports. Returns URL if yes, None if skip.
pub fn check_redis() -> Option<String> {
    for port in &["6379", "16379"] {
        if std::process::Command::new("redis-cli")
            .arg("-p").arg(*port).arg("ping")
            .output().map(|o| o.status.success()).unwrap_or(false)
        {
            return Some(format!("redis://127.0.0.1:{}", port));
        }
    }
    None
}
