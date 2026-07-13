use sqlx::PgPool;

pub mod users;
pub mod api_keys;
pub mod orgs;

pub async fn migrate(pool: &PgPool) -> anyhow::Result<()> {
    let sql = include_str!("../../migrations/001_init.sql");
    sqlx::query(sql).execute(pool).await?;
    tracing::info!("Database migrations applied");
    Ok(())
}
