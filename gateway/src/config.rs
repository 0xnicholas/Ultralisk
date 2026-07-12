use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub gateway_port: u16,
    pub redis_url: String,
    pub auth_service_url: String,
    pub console_api_url: String,
    pub rate_limit_window_secs: u64,
    pub rate_limit_enabled: bool,
    pub auth_cache_ttl_secs: u64,
    pub upstream_timeout_secs: u64,
    pub admin_upstream_timeout_secs: u64,
    pub route_table_path: String,
    pub database_url: String,
    pub max_body_size: usize,
    pub shutdown_drain_secs: u64,
}

impl AppConfig {
    pub fn from_env() -> Self {
        fn parse_or<T: std::str::FromStr>(key: &str, default: T) -> T {
            env::var(key).ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default)
        }

        Self {
            gateway_port: parse_or("GATEWAY_PORT", 8080u16),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            auth_service_url: env::var("AUTH_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:3101".into()),
            console_api_url: env::var("CONSOLE_API_URL")
                .unwrap_or_else(|_| "http://localhost:3100".into()),
            rate_limit_window_secs: parse_or("RATE_LIMIT_WINDOW_SECS", 60),
            rate_limit_enabled: env::var("RATE_LIMIT_ENABLED")
                .unwrap_or_else(|_| "true".into())
                .eq_ignore_ascii_case("true") || env::var("RATE_LIMIT_ENABLED").unwrap_or_default() == "1",
            auth_cache_ttl_secs: parse_or("AUTH_CACHE_TTL_SECS", 60),
            upstream_timeout_secs: parse_or("UPSTREAM_TIMEOUT_SECS", 60),
            admin_upstream_timeout_secs: parse_or("ADMIN_UPSTREAM_TIMEOUT_SECS", 30),
            route_table_path: env::var("ROUTE_TABLE_PATH")
                .unwrap_or_else(|_| "config/route_table.json".into()),
            database_url: env::var("DATABASE_URL").unwrap_or_default(),
            max_body_size: parse_or("MAX_BODY_SIZE", 10 * 1024 * 1024usize),
            shutdown_drain_secs: parse_or("SHUTDOWN_DRAIN_SECS", 30),
        }
    }
}
