use std::sync::Once;
use ultralisk_gateway::config::AppConfig;
use ultralisk_gateway::app;

mod common;

static INIT: Once = Once::new();
fn init() { INIT.call_once(|| { tracing_subscriber::fmt().with_env_filter("off").try_init().ok(); }); }

#[tokio::test]
async fn test_model_not_in_route_table_404() {
    let redis_url = match common::check_redis() {
        Some(u) => u,
        None => return,
    };
    let (auth_url, _a) = common::start_mock_auth_service().await;
    let (vllm_url, _v) = common::start_mock_vllm().await;
    let vllm = vllm_url.trim_end_matches('/').replace("http://", "");

    init();
    std::env::set_var("AUTH_SERVICE_URL", &auth_url);
    std::env::set_var("CONSOLE_API_URL", "http://127.0.0.1:1");
    std::env::set_var("REDIS_URL", &redis_url);
    std::env::set_var("DATABASE_URL", "postgres://localhost:5432/test_dummy");
    std::env::set_var("RATE_LIMIT_ENABLED", "false");
    let rp = common::write_temp_route_table(&[("vllm-test", &vllm)]);
    std::env::set_var("ROUTE_TABLE_PATH", &rp);

    let r = app::build(AppConfig::from_env()).await.expect("build");
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let a = l.local_addr().unwrap();
    let gw = format!("http://{}", a);
    tokio::spawn(async move { axum::serve(l, r.into_make_service()).await.unwrap(); });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let resp = reqwest::Client::new()
        .post(format!("{}/v1/chat/completions", gw))
        .header("Authorization", "Bearer ultr_valid")
        .json(&serde_json::json!({"model":"nonexistent-model","messages":[{"role":"user","content":"x"}]}))
        .send().await.unwrap();
    assert_eq!(resp.status(), 404);
}
