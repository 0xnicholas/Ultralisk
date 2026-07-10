// === User & Auth ===
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'developer' | 'readonly';
  org_id: string;
  org_name: string;
  created_at: string;
}

// === Models ===
export interface Model {
  id: string;
  display_name: string;
  author: string;
  category: 'chat' | 'embedding' | 'image' | 'audio' | 'video' | 'moderation';
  description: string;
  capabilities: {
    context_window: number;
    max_output_tokens: number;
    json_mode: boolean;
    tool_calling: boolean;
    multi_modal: boolean;
    fine_tuning: boolean;
  };
  pricing: {
    serverless: {
      input_per_1m_tokens: number;
      output_per_1m_tokens: number;
      cached_input_per_1m_tokens?: number;
    };
    batch_discount_percent?: number;
    dedicated?: {
      gpu_type: string;
      price_per_hour: number;
    };
  };
  deployment_types: ('serverless' | 'dedicated')[];
  status: 'available' | 'degraded' | 'unavailable';
  version: string;
  featured: boolean;
  created_at: string;
}

export interface ModelDetail extends Model {
  usage_examples: {
    curl: string;
    python: string;
    typescript: string;
  };
}

// === API Keys ===
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  role: 'admin' | 'developer' | 'readonly';
  model_allowlist: string[] | null;
  monthly_quota_usd: number | null;
  usage_this_month_usd: number;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: 'active' | 'revoked';
}

export interface ApiKeyCreated extends ApiKey {
  secret: string;
}

export interface CreateApiKeyRequest {
  name: string;
  role: 'admin' | 'developer' | 'readonly';
  model_allowlist?: string[];
  monthly_quota_usd?: number;
}

// === Usage ===
export interface UsageSummary {
  period: { from: string; to: string };
  totals: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  by_model: {
    model_id: string;
    model_display_name: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  by_key: {
    key_id: string;
    key_name: string;
    key_prefix: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  recent_activity: {
    timestamp: string;
    model_id: string;
    status_code: number;
    latency_ms: number;
    tokens: number;
  }[];
}

// === Billing ===
export interface Billing {
  balance_usd: number;
  monthly_budget_usd: number | null;
  month_to_date_spend_usd: number;
  estimated_month_end_usd: number;
  auto_recharge_enabled: boolean;
  invoices: {
    id: string;
    period: string;
    amount_usd: number;
    status: 'paid' | 'pending' | 'overdue';
    download_url: string;
    issued_at: string;
  }[];
}

// === Chat ===
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PlaygroundSession {
  id: string;
  name: string;
  modelId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// === API Response wrappers ===
export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
}

export interface SingleResponse<T> {
  data: T;
}
