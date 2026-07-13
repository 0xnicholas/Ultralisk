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
