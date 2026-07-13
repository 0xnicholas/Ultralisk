use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand::rngs::OsRng;
use crate::error::AppError;

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("Password hash: {}", e)))
}

pub fn verify_password(hash: &str, password: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("Invalid stored hash: {}", e)))?;
    Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let hash = hash_password("mysecret").unwrap();
        assert!(verify_password(&hash, "mysecret").unwrap());
        assert!(!verify_password(&hash, "wrongpassword").unwrap());
    }

    #[test]
    fn test_different_passwords_different_hashes() {
        let h1 = hash_password("a").unwrap();
        let h2 = hash_password("b").unwrap();
        assert_ne!(h1, h2);
    }
}
