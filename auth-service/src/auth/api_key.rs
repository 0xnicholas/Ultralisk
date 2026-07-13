use sha2::{Sha256, Digest};
use rand::Rng;

pub fn generate_key() -> String {
    let random_part: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    format!("ultr_{}", random_part)
}

pub fn key_prefix(key: &str) -> String {
    key.chars().take(9).collect()
}

pub fn hash_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_key_format() {
        let key = generate_key();
        assert!(key.starts_with("ultr_"));
        assert_eq!(key.len(), 37);
    }

    #[test]
    fn test_hash_key_deterministic() {
        let h1 = hash_key("ultr_test123");
        let h2 = hash_key("ultr_test123");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_key_different_keys() {
        let h1 = hash_key("ultr_aaa");
        let h2 = hash_key("ultr_bbb");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_key_prefix() {
        let prefix = key_prefix("ultr_abc123def456");
        assert_eq!(prefix, "ultr_abc1");
        assert_eq!(prefix.len(), 9);
    }
}
