use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
fn main() {
    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = Argon2::default().hash_password(b"test123", &salt).unwrap();
    println!("{hash}");
}
