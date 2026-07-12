use std::sync::Once;
use std::process::Command;

use ultralisk_gateway::config::AppConfig;
use ultralisk_gateway::app;

mod common;

static INIT: Once = Once::new();

fn init_tracing() {
    INIT.call_once(|| { tracing_subscriber::fmt().with_env_filter("off").try_init().ok(); });
}

fn check_redis() -> Option<String> { common::check_redis() }

async fn bootstrap_admin(console_url: &str, auth_url: &str, redis_url: &str) -> String {
    init_tracing();
    std::env::set_var("AUTH_SERVICE_URL", auth_url);
    std::env::set_var("CONSOLE_API_URL", console_url);
    std::env::set_var("REDIS_URL", redis_url);
    std::env::set_var("DATABASE_URL", "postgres://localhost:5432/test_dummy");
    std::env::set_var("RATE_LIMIT_ENABLED", "false");
    let route_path = common::write_temp_route_table(&[("test", "127.0.0.1:1")]);
    std::env::set_var("ROUTE_TABLE_PATH", &route_path);

    let config = AppConfig::from_env();
    let router = app::build(config).await.expect("build gateway");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{}", addr);
    tokio::spawn(async move { axum::serve(listener, router.into_make_service()).await.unwrap(); });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    base_url
}

#[tokio::test]
async fn test_admin_get_proxy_200() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (console_url, _console) = common::start_mock_console_api().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let gw_url = bootstrap_admin(&console_url, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .get(format!("{}/v1/admin/models", gw_url))
        .header("Authorization", "Bearer ultr_valid")
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["echo"]["path"], "models");
    assert_eq!(body["echo"]["received_user_id"], "usr_test");
}

#[tokio::test]
async fn test_admin_post_proxy_200() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (console_url, _console) = common::start_mock_console_api().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let gw_url = bootstrap_admin(&console_url, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .post(format!("{}/v1/admin/endpoints", gw_url))
        .header("Authorization", "Bearer ultr_valid")
        .json(&serde_json::json!({"name": "my-endpoint", "model": "llama-8b"}))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["echo"]["method"], "POST");
    assert!(body["echo"]["body_size"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn test_header_stripping_client_user_id_replaced() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (console_url, _console) = common::start_mock_console_api().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let gw_url = bootstrap_admin(&console_url, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .get(format!("{}/v1/admin/models", gw_url))
        .header("Authorization", "Bearer ultr_valid")
        .header("x-user-id", "attacker")
        .header("x-org-id", "attacker-org")
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["echo"]["received_user_id"], "usr_test");
}

#[tokio::test]
async fn test_admin_missing_auth_401() {
    let redis_url = match check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (console_url, _console) = common::start_mock_console_api().await;
    let (auth_url, _auth) = common::start_mock_auth_service().await;
    let gw_url = bootstrap_admin(&console_url, &auth_url, &redis_url).await;

    let resp = reqwest::Client::new()
        .get(format!("{}/v1/admin/models", gw_url))
        .send().await.unwrap();
    assert_eq!(resp.status(), 401);
}
