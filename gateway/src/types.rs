use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// --- API Key auth result, stored in extensions ---

#[derive(Clone, Debug)]
pub struct AuthResult {
    pub user_id: String,
    pub org_id: String,
    pub api_key_id: String,
    pub quota_limits: HashMap<String, u64>, // model_id → token_limit_per_window
}

// --- Parsed chat completion request, stored in extensions ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

fn default_max_tokens() -> u32 {
    256
}

// --- Route resolution result, stored in extensions ---

#[derive(Clone, Debug)]
pub struct RouteInfo {
    pub model_id: String,
    pub pool_name: String,
    pub pod_address: String,
    pub strategy: String,
}

// --- Request context, built incrementally in extensions ---

#[derive(Clone, Debug)]
pub struct RequestContext {
    pub request_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
}
