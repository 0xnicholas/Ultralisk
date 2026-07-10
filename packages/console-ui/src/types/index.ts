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

// === Endpoints ===
export interface Endpoint {
  id: string;
  name: string;
  model_id: string;
  type: 'serverless' | 'reserved' | 'dedicated';
  replicas: number;
  gpu_spec: { type: string; count: number };
  autoscaling_policy: { min_replicas: number; max_replicas: number; target_cpu_util: number } | null;
  metrics: { qps: number; ttft_p95_ms: number; tpot_ms: number; error_rate: number; gpu_util: number };
  status: 'active' | 'degraded' | 'creating' | 'deleted';
  created_at: string;
}

export interface CreateEndpointRequest {
  name: string;
  model_id: string;
  type: 'reserved' | 'dedicated';
  replicas?: number;
  gpu_spec?: { type: string; count: number };
  autoscaling_policy?: { min_replicas: number; max_replicas: number; target_cpu_util: number };
}

// === Batch Jobs ===
export interface BatchJob {
  id: string;
  name: string;
  model_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input_file: string;
  output_file: string | null;
  callback_url: string | null;
  token_count: number | null;
  cost: number | null;
  created_at: string;
  completed_at: string | null;
  error_log: { line: number; error: string }[] | null;
}

export interface CreateBatchJobRequest {
  name: string;
  model_id: string;
  input_file: string;
  callback_url?: string;
}

// === Backend Session (Phase 1b) ===
export interface BackendSession {
  id: string;
  name: string;
  model_id: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  created_at: string;
  updated_at: string;
}

// === Cluster (Phase 2) ===
export interface Cluster {
  id: string; name: string; region: string; gpu_type: string;
  node_count: number; healthy_nodes: number; status: 'healthy' | 'degraded';
  avg_gpu_util: number;
}

export interface ClusterDetail extends Cluster {
  nodes: Node[];
  total_gpu: number;
  avg_gpu_util: number;
}

// === Node (Phase 2) ===
export interface Node {
  id: string; cluster_id: string; hostname: string; gpu_model: string;
  gpu_count: number; driver_version: string; cuda_version: string;
  status: 'online' | 'degraded' | 'offline';
}

export interface NodeDetail extends Node {
  gpu_cards: GpuCard[];
}

// === GpuCard (Phase 2) ===
export interface GpuCard {
  id: string; node_id: string; index: number;
  utilization_percent: number; memory_used: number; memory_total: number;
  temperature: number;
  processes: { pid: number; name: string; memory_mb: number }[];
  metrics: { metric_name: string; timestamp: string; value: number }[];
}

// === Deployment (Phase 2) ===
export interface Deployment {
  id: string; name: string; model_id: string; endpoint_id: string | null;
  cluster_id: string; replicas: number; gpu_per_replica: number;
  status: 'active' | 'degraded' | 'rolling_back'; created_at: string;
}

export interface DeploymentDetail extends Deployment {
  versions: DeploymentVersion[];
}

export interface DeploymentVersion {
  version: number; deployed_at: string; status: string; image: string;
}

// === GPU Utilization (Phase 2b) ===
export interface GpuUtilizationOverview {
  total_gpu: number; avg_utilization: number; idle_gpu: number; queued_requests: number;
}

export interface GpuUtilizationTimePoint {
  timestamp: string; avg_utilization: number; idle_count: number; queued_count: number;
}

export interface GpuUtilizationPerModel {
  model_id: string; model_display: string; gpu_allocated: number; gpu_utilization: number; requests_per_sec: number;
}

export interface GpuUtilizationPerTenant {
  tenant: string; gpu_allocated: number; gpu_utilization: number; token_usage: number; cost_usd: number;
}

export interface GpuUtilizationData {
  overview: GpuUtilizationOverview;
  time_series: GpuUtilizationTimePoint[];
  per_model: GpuUtilizationPerModel[];
  per_tenant: GpuUtilizationPerTenant[];
}

// === Cost Analytics (Phase 2c) ===
export interface CostAnalyticsDimension {
  name: string; cost_usd: number; gpu_hours: number; tokens_m: number; pct: number;
}

export interface CostAnalyticsSummary {
  total_cost_usd: number; token_cost_usd: number; gpu_hour_cost_usd: number;
  budget_usd: number; budget_used_pct: number; estimated_month_end_usd: number;
}

export interface DailyCostPoint {
  date: string; token_cost: number; gpu_cost: number;
}

export interface BudgetAlertThreshold {
  label: string; type: string; value: number; triggered: boolean; triggered_at?: string;
}

export interface BudgetAlertsConfig {
  budget_usd: number; current_spend: number; alerts_enabled: boolean;
  channels: string[]; thresholds: BudgetAlertThreshold[];
  suppression_window_minutes: number;
}

export interface CostAnalyticsData {
  summary: CostAnalyticsSummary;
  by_dimension: Record<string, CostAnalyticsDimension[]>;
  daily_cost_trend: DailyCostPoint[];
  budget_alerts: BudgetAlertsConfig;
}

// === Incident (Phase 2d) ===
export interface IncidentRootCause { cause: string; confidence: number; evidence: string; }
export interface IncidentRecommendation { action: string; risk: 'low' | 'medium' | 'high'; description: string; }
export interface IncidentActionLog { timestamp: string; user_id: string; action: string; result: string; }
export interface IncidentConversation { timestamp: string; role: 'user' | 'assistant'; content: string; }
export interface Incident {
  id: string; severity: 'critical' | 'warning'; status: 'open' | 'investigating' | 'mitigated' | 'resolved' | 'suppressed';
  title: string; description: string; detection_type: string;
  affected_entities: { cluster_id?: string; node_id?: string; model_id?: string; endpoint_id?: string; };
  ai_analysis: { model_used: string; completed_at: string; root_causes: IncidentRootCause[]; recommendations: IncidentRecommendation[]; };
  conversation_history: IncidentConversation[];
  action_log: IncidentActionLog[];
  triggered_at: string; mitigated_at: string | null; resolved_at: string | null; suppressed_at: string | null;
}

// === Alert (Phase 2d) ===
export interface Alert {
  id: string; incident_id: string; name: string; description: string; severity: string;
  source_metric: string; status: 'firing' | 'resolved' | 'suppressed';
  fired_at: string; resolved_at: string | null; notification_channels: string[];
}

// === Auto-Remediation (Phase 2d) ===
export interface RemediationOperation { id: string; label: string; enabled: boolean; }
export interface AutoRemediationConfig {
  enabled: boolean;
  tiers: {
    tier1: { enabled: boolean; operations: RemediationOperation[]; };
    tier2: { enabled: boolean; approval_channels: string[]; operations: RemediationOperation[]; };
    tier3: { enabled: boolean; operations: RemediationOperation[]; };
  };
  auto_suppression: { enabled: boolean; window_hours: number; };
}

// === Slack Config (Phase 2d) ===
export interface SlackConfig {
  connected: boolean; workspace_name: string | null; channels: string[];
  notifications: { critical: boolean; warning: boolean; ai_summary: boolean; incident_actions: boolean; };
  slash_commands: { command: string; description: string; }[];
}
