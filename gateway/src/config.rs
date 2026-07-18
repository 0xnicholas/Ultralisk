use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub gateway_port: u16,
    pub batch_internal_port: u16,
    pub batch_instance_id: String,
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
    pub batch_window_secs: u64,
    pub batch_max_requests: usize,
    pub cold_start_timeout_secs: u64,
    pub kai_scheduler_url: String,
    pub health_check_interval_secs: u64,
    pub health_check_timeout_secs: u64,
    pub passive_check_window_size: u64,
    pub passive_check_error_threshold: f64,
    pub passive_check_latency_threshold_ms: u64,
    pub passive_check_min_samples: u64,
    pub passive_check_cooldown_secs: u64,
    pub breaker_trip_count: u64,
    pub breaker_cooldown_secs: u64,
    pub breaker_probe_timeout_secs: u64,
}

impl AppConfig {
    pub fn from_env() -> Self {
        fn parse_or<T: std::str::FromStr>(key: &str, default: T) -> T {
            env::var(key).ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default)
        }

        let gateway_port = parse_or("GATEWAY_PORT", 8080u16);
        let batch_internal_port = parse_or("BATCH_INTERNAL_PORT", 8081u16);
        let batch_instance_id = env::var("BATCH_INSTANCE_ID").unwrap_or_else(|_| {
            let host = hostname::get()
                .map(|h| h.to_string_lossy().into_owned())
                .unwrap_or_else(|_| "unknown".into());
            format!("{}:{}", host, gateway_port)
        });

        Self {
            gateway_port,
            batch_internal_port,
            batch_instance_id,
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
            batch_window_secs: parse_or("BATCH_WINDOW_SECS", 60u64),
            batch_max_requests: parse_or("BATCH_MAX_REQUESTS", 100usize),
            cold_start_timeout_secs: parse_or("COLD_START_TIMEOUT_SECS", 300u64),
            kai_scheduler_url: env::var("KAI_SCHEDULER_URL")
                .unwrap_or_else(|_| "http://localhost:9090".into()),
            health_check_interval_secs: parse_or("HEALTH_CHECK_INTERVAL_SECS", 5u64),
            health_check_timeout_secs: parse_or("HEALTH_CHECK_TIMEOUT_SECS", 3u64),
            passive_check_window_size: parse_or("PASSIVE_CHECK_WINDOW_SIZE", 100u64),
            passive_check_error_threshold: parse_or("PASSIVE_CHECK_ERROR_THRESHOLD", 0.2f64),
            passive_check_latency_threshold_ms: parse_or("PASSIVE_CHECK_LATENCY_THRESHOLD_MS", 10_000u64),
            passive_check_min_samples: parse_or("PASSIVE_CHECK_MIN_SAMPLES", 10u64),
            passive_check_cooldown_secs: parse_or("PASSIVE_CHECK_COOLDOWN_SECS", 30u64),
            breaker_trip_count: parse_or("BREAKER_TRIP_COUNT", 3u64),
            breaker_cooldown_secs: parse_or("BREAKER_COOLDOWN_SECS", 30u64),
            breaker_probe_timeout_secs: parse_or("BREAKER_PROBE_TIMEOUT_SECS", 5u64),
        }
    }
}
