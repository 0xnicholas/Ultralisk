use axum::{extract::State, Json};
use axum::http::HeaderMap;
use sqlx::PgPool;
use uuid::Uuid;
use crate::auth::jwt;
use crate::db::{users, orgs, api_keys};
use crate::error::AppError;
use crate::types::{MeResponse, OrgInfo, ApiKeySummary};

fn extract_jwt(headers: &HeaderMap, secret: &str) -> Result<jwt::Claims, AppError> {
    let auth = headers.get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    let token = auth.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
    jwt::verify_token(token, secret)
}

pub async fn handler(
    State(pool): State<PgPool>,
    State(jwt_secret): State<String>,
    headers: HeaderMap,
) -> Result<Json<MeResponse>, AppError> {
    let claims = extract_jwt(&headers, &jwt_secret)?;
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::InvalidToken)?;

    let user = users::find_by_id(&pool, &user_id).await?
        .ok_or(AppError::InvalidToken)?;

    let org = orgs::find_by_id(&pool, &user.org_id).await?
        .ok_or(AppError::Internal("Org not found".into()))?;

    let keys = api_keys::list_by_user(&pool, &user_id).await?;
    let key_summaries: Vec<ApiKeySummary> = keys.iter().map(|k| ApiKeySummary {
        id: k.id.to_string(),
        key_prefix: k.key_prefix.clone(),
        name: k.name.clone(),
        status: k.status.clone(),
        last_used_at: k.last_used_at,
        created_at: k.created_at,
    }).collect();

    Ok(Json(MeResponse {
        id: user.id.to_string(),
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        org: OrgInfo { id: org.id.to_string(), name: org.name },
        api_keys: key_summaries,
    }))
}
