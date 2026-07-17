use sqlx::PgPool;

pub mod users;
pub mod api_keys;
pub mod orgs;

pub async fn migrate(pool: &PgPool) -> anyhow::Result<()> {
    // Check if orgs table exists — if so, skip migration
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orgs')"
    ).fetch_one(pool).await?;
    if exists {
        // Run incremental migrations
        let sql002 = include_str!("../../migrations/002_totp.sql");
        for stmt in sql002.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            sqlx::query(stmt).execute(pool).await?;
        }
        tracing::info!("Incremental migrations applied");
        return Ok(());
    }
    let sql = include_str!("../../migrations/001_init.sql");
    // Split by semicolons and execute each statement
    for stmt in sql.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        sqlx::query(stmt).execute(pool).await?;
    }
    tracing::info!("Database migrations applied");
    Ok(())
}
