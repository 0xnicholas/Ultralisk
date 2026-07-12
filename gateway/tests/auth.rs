use std::sync::Once;
use ultralisk_gateway::config::AppConfig;
use ultralisk_gateway::app;

mod common;

static INIT: Once = Once::new();
fn init() { INIT.call_once(|| { tracing_subscriber::fmt().with_env_filter("off").try_init().ok(); }); }

async fn bootstrap(redis_url: &str, auth_url: &str) -> String {
    init();
    std::env::set_var("AUTH_SERVICE_URL", auth_url);
    std::env::set_var("CONSOLE_API_URL", "http://127.0.0.1:1");
    std::env::set_var("REDIS_URL", redis_url);
    std::env::set_var("DATABASE_URL", "postgres://localhost:5432/test_dummy");
    std::env::set_var("RATE_LIMIT_ENABLED", "false");
    let rp = common::write_temp_route_table(&[("t", "127.0.0.1:1")]);
    std::env::set_var("ROUTE_TABLE_PATH", &rp);
    let c = AppConfig::from_env();
    let r = app::build(c).await.expect("build gateway");
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let a = l.local_addr().unwrap();
    let base = format!("http://{}", a);
    tokio::spawn(async move { axum::serve(l, r.into_make_service()).await.unwrap(); });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    base
}

#[tokio::test]
async fn test_missing_auth_header_401() {
    let redis_url = match common::check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (auth_url, _a) = common::start_mock_auth_service().await;
    let gw = bootstrap(&redis_url, &auth_url).await;
    let resp = reqwest::Client::new().get(format!("{}/v1/admin/test", gw)).send().await.unwrap();
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_revoked_key_401() {
    let redis_url = match common::check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (auth_url, _a) = common::start_mock_auth_service().await;
    let gw = bootstrap(&redis_url, &auth_url).await;
    let resp = reqwest::Client::new()
        .get(format!("{}/v1/admin/test", gw))
        .header("Authorization", "Bearer ultr_revoked").send().await.unwrap();
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_unknown_key_401_with_negative_cache() {
    let redis_url = match common::check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (auth_url, _a) = common::start_mock_auth_service().await;
    let gw = bootstrap(&redis_url, &auth_url).await;
    let client = reqwest::Client::new();
    let url = format!("{}/v1/admin/test", gw);
    assert_eq!(client.get(&url).header("Authorization", "Bearer ultr_unknown").send().await.unwrap().status(), 401);
    assert_eq!(client.get(&url).header("Authorization", "Bearer ultr_unknown").send().await.unwrap().status(), 401);
}

#[tokio::test]
async fn test_valid_key_passes() {
    let redis_url = match common::check_redis() {
        Some(u) => u,
        None => { eprintln!("SKIP: Redis not available"); return; }
    };
    let (auth_url, _a) = common::start_mock_auth_service().await;
    let gw = bootstrap(&redis_url, &auth_url).await;
    let resp = reqwest::Client::new()
        .get(format!("{}/v1/admin/test", gw))
        .header("Authorization", "Bearer ultr_valid").send().await.unwrap();
    assert_ne!(resp.status(), 401);
}
