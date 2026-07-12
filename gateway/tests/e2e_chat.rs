use std::sync::Once;
use std::process::Command;

use ultralisk_gateway::config::AppConfig;
use ultralisk_gateway::app;

mod common;

static INIT: Once = Once::new();

fn init_tracing() {
    INIT.call_once(|| {
        tracing_subscriber::fmt().with_env_filter("off").try_init().ok();
    });
}

fn check_redis() -> Option<String> {
    for port in &["6379", "16379"] {
        if Command::new("redis-cli").arg("-p").arg(*port).arg("ping")
            .output().map(|o| o.status.success()).unwrap_or(false)
        {
            return Some(format!("redis://127.0.0.1:{}", port));
        }
    }
    None
}

async fn bootstrap(mock_vllm_addr: &str, mock_auth_addr: &str, redis_url: &str) -> String {
    init_tracing();
    std::env::set_var("AUTH_SERVICE_URL", mock_auth_addr);
    std::env::set_var("CONSOLE_API_URL", "http://127.0.0.1:1");
    std::env::set_var("REDIS_URL", redis_url);
    std::env::set_var("DATABASE_URL", "postgres://localhost:5432/test_dummy");
    std::env::set_var("RATE_LIMIT_ENABLED", "false");
    let route_path = common::write_temp_route_table(&[("vllm-test", mock_vllm_addr)]);
    std::env::set_var("ROUTE_TABLE_PATH", &route_path);

    let config = AppConfig::from_env();
    let router = app::build(config).await.expect("Failed to build Gateway");

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{}", addr);

    tokio::spawn(async move { axum::serve(listener, router.into_make_service()).await.unwrap(); });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    base_url
}

#[tokio::test]
async fn test_non_streaming_chat_200() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => return,
    };
    let (vllm_url, _vllm) = common::start_mock_vllm().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let vllm_addr = vllm_url.trim_end_matches('/').replace("http://", "");
    let gw_url = bootstrap(&vllm_addr, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .post(format!("{}/v1/chat/completions", gw_url))
        .header("Authorization", "Bearer ultr_valid")
        .json(&serde_json::json!({
            "model": "llama-3.1-8b-instruct",
            "messages": [{"role": "user", "content": "Hello"}]
        }))
        .send().await.unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["choices"][0]["message"]["content"], "Hello! How can I help you?");
    assert_eq!(body["usage"]["total_tokens"], 18);
}

#[tokio::test]
async fn test_streaming_chat_200() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => return,
    };
    let (vllm_url, _vllm) = common::start_mock_vllm().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let vllm_addr = vllm_url.trim_end_matches('/').replace("http://", "");
    let gw_url = bootstrap(&vllm_addr, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .post(format!("{}/v1/chat/completions", gw_url))
        .header("Authorization", "Bearer ultr_valid")
        .json(&serde_json::json!({
            "model": "llama-3.1-8b-instruct",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true
        }))
        .send().await.unwrap();

    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    assert!(body.contains("Hello"));
    assert!(body.contains("usage"));
    assert!(body.contains("[DONE]"));
}

#[tokio::test]
async fn test_missing_auth_401() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => return,
    };
    let (vllm_url, _vllm) = common::start_mock_vllm().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let vllm_addr = vllm_url.trim_end_matches('/').replace("http://", "");
    let gw_url = bootstrap(&vllm_addr, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .post(format!("{}/v1/chat/completions", gw_url))
        .json(&serde_json::json!({
            "model": "llama-3.1-8b-instruct",
            "messages": [{"role": "user", "content": "Hello"}]
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_invalid_model_404() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => return,
    };
    let (vllm_url, _vllm) = common::start_mock_vllm().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let vllm_addr = vllm_url.trim_end_matches('/').replace("http://", "");
    let gw_url = bootstrap(&vllm_addr, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .post(format!("{}/v1/chat/completions", gw_url))
        .header("Authorization", "Bearer ultr_valid")
        .json(&serde_json::json!({
            "model": "nonexistent-model",
            "messages": [{"role": "user", "content": "Hello"}]
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 404);
}
