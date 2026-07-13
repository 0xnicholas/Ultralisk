use axum::{extract::State, Json};
use crate::revocation::Revocation;
use crate::error::AppError;

#[derive(serde::Serialize)]
pub struct RevocationVersionResponse {
    pub version: u64,
}

pub async fn handler(
    State(revocation): State<Revocation>,
) -> Result<Json<RevocationVersionResponse>, AppError> {
    let version = revocation.get_version().await?;
    Ok(Json(RevocationVersionResponse { version }))
}
