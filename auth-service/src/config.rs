use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub auth_port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            auth_port: env::var("AUTH_PORT")
                .unwrap_or_else(|_| "3101".into())
                .parse()
                .unwrap_or(3101),
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://localhost:5432/ultralisk".into()),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-secret-change-in-production".into()),
        }
    }
}
