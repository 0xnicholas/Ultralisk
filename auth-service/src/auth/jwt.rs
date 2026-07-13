use chrono::{Utc, Duration};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub org_id: String,
    pub role: String,
    pub iat: usize,
    pub jti: String,
    pub iss: String,
    pub exp: usize,
}

pub fn create_access_token(user_id: &str, org_id: &str, role: &str, secret: &str) -> Result<String, AppError> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id.to_string(),
        org_id: org_id.to_string(),
        role: role.to_string(),
        iat: now.timestamp() as usize,
        jti: Uuid::now_v7().to_string(),
        iss: "ultralisk-auth".into(),
        exp: (now + Duration::hours(1)).timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|e| AppError::Internal(format!("JWT encode: {}", e)))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::default())
        .map(|data| data.claims)
        .map_err(|_| AppError::InvalidToken)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_roundtrip() {
        let token = create_access_token("usr_1", "org_1", "admin", "secret").unwrap();
        let claims = verify_token(&token, "secret").unwrap();
        assert_eq!(claims.sub, "usr_1");
        assert_eq!(claims.org_id, "org_1");
        assert_eq!(claims.role, "admin");
        assert_eq!(claims.iss, "ultralisk-auth");
        assert!(!claims.jti.is_empty());
    }

    #[test]
    fn test_jwt_wrong_secret_fails() {
        let token = create_access_token("usr_1", "org_1", "admin", "secret").unwrap();
        assert!(verify_token(&token, "wrong_secret").is_err());
    }
}
