use std::sync::Once;
use ultralisk_gateway::config::AppConfig;
use ultralisk_gateway::app;

mod common;

static INIT: Once = Once::new();
fn init() { INIT.call_once(|| { tracing_subscriber::fmt().with_env_filter("off").try_init().ok(); }); }

async fn bootstrap(redis_url: &str, auth_url: &str, vllm_addr: &str) -> String {
    init();
    std::env::set_var("AUTH_SERVICE_URL", auth_url);
    std::env::set_var("CONSOLE_API_URL", "http://127.0.0.1:1");
    std::env::set_var("REDIS_URL", redis_url);
    std::env::set_var("DATABASE_URL", "postgres://localhost:5432/test_dummy");
    std::env::set_var("RATE_LIMIT_ENABLED", "true");
    std::env::set_var("RATE_LIMIT_WINDOW_SECS", "5");
    let rp = common::write_temp_route_table(&[("vllm-test", vllm_addr)]);
    std::env::set_var("ROUTE_TABLE_PATH", &rp);
    let r = app::build(AppConfig::from_env()).await.expect("build");
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let a = l.local_addr().unwrap();
    let url = format!("http://{}", a);
    tokio::spawn(async move { axum::serve(l, r.into_make_service()).await.unwrap(); });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    url
}

#[tokio::test]
async fn test_under_limit_200() {
    let redis_url = match common::check_redis() {
        Some(u) => u,
        None => return,
    };
    let (vllm_url, _v) = common::start_mock_vllm().await;
    let (auth_url, _a) = common::start_mock_auth_service().await;
    let vllm = vllm_url.trim_end_matches('/').replace("http://", "");
    let gw = bootstrap(&redis_url, &auth_url, &vllm).await;

    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", gw);
    let body = serde_json::json!({"model":"llama-3.1-8b-instruct","messages":[{"role":"user","content":"Hello"}]});

    for _ in 0..3 {
        let resp = client.post(&url).header("Authorization", "Bearer ultr_valid").json(&body).send().await.unwrap();
        assert_eq!(resp.status(), 200);
    }
}
