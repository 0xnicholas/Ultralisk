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
        Self {
            gateway_port: env::var("GATEWAY_PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse()
                .unwrap(),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            auth_service_url: env::var("AUTH_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:3101".into()),
            console_api_url: env::var("CONSOLE_API_URL")
                .unwrap_or_else(|_| "http://localhost:3100".into()),
            rate_limit_window_secs: env::var("RATE_LIMIT_WINDOW_SECS")
                .unwrap_or_else(|_| "60".into())
                .parse()
                .unwrap(),
            rate_limit_enabled: env::var("RATE_LIMIT_ENABLED")
                .unwrap_or_else(|_| "true".into())
                == "true",
            auth_cache_ttl_secs: env::var("AUTH_CACHE_TTL_SECS")
                .unwrap_or_else(|_| "60".into())
                .parse()
                .unwrap(),
            upstream_timeout_secs: env::var("UPSTREAM_TIMEOUT_SECS")
                .unwrap_or_else(|_| "60".into())
                .parse()
                .unwrap(),
            admin_upstream_timeout_secs: env::var("ADMIN_UPSTREAM_TIMEOUT_SECS")
                .unwrap_or_else(|_| "30".into())
                .parse()
                .unwrap(),
            route_table_path: env::var("ROUTE_TABLE_PATH")
                .unwrap_or_else(|_| "config/route_table.json".into()),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            max_body_size: env::var("MAX_BODY_SIZE")
                .unwrap_or_else(|_| "10485760".into())
                .parse()
                .unwrap(),
            shutdown_drain_secs: env::var("SHUTDOWN_DRAIN_SECS")
                .unwrap_or_else(|_| "30".into())
                .parse()
                .unwrap(),
        }
    }
}
