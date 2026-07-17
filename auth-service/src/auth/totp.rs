use totp_rs::{TOTP, Algorithm, Secret, SecretParseError};

/// Generate a new TOTP secret and return the provisioning URI + hex-encoded secret for storage.
pub fn generate_secret(email: &str) -> (String, String) {
    let secret = Secret::generate_secret();
    let bytes = secret.to_bytes().unwrap();
    let hex_secret = hex::encode(&bytes);

    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        bytes,
        Some("Ultralisk".to_string()),
        email.to_string(),
    )
    .unwrap();

    let uri = totp.get_url();
    (uri, hex_secret)
}

/// Verify a TOTP code against a stored hex-encoded secret.
pub fn verify_code(hex_secret: &str, code: &str) -> bool {
    let bytes = match hex::decode(hex_secret) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let totp = match TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        bytes,
        Some("Ultralisk".to_string()),
        String::new(),
    ) {
        Ok(t) => t,
        Err(_) => return false,
    };

    match totp.check_current(code) {
        Ok(valid) => valid,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_secret_returns_uri_and_secret() {
        let (uri, secret) = generate_secret("test@example.com");
        assert!(uri.contains("otpauth://totp/"));
        assert!(uri.contains("Ultralisk"));
        assert!(!secret.is_empty());
        assert!(secret.len() >= 16);
    }

    #[test]
    fn test_verify_with_invalid_secret() {
        assert!(!verify_code("ZZZZZZZZZZZZ", "123456"));
    }

    #[test]
    fn test_verify_valid_code_fails_for_wrong_code() {
        let (_, secret) = generate_secret("test@example.com");
        assert!(!verify_code(&secret, "000000"));
    }
}
