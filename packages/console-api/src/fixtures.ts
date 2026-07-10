export const MOCK_USER = {
  id: 'usr_001',
  email: 'dev@ultralisk.com',
  name: 'Alice Developer',
  avatar_url: null,
  role: 'admin' as const,
  org_id: 'org_001',
  org_name: 'Ultralisk Labs',
  created_at: '2026-07-01T00:00:00Z',
};

export const MOCK_JWT = 'mock-jwt-token-for-development';

export const MOCK_MODELS = [
  {
    id: 'llama-3.3-70b-instruct', display_name: 'Llama 3.3 70B Instruct', author: 'Meta',
    category: 'chat', description: "Meta's latest 70B parameter instruction-tuned model with strong reasoning capabilities.",
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 0.59, output_per_1m_tokens: 0.79, cached_input_per_1m_tokens: 0.10 }, batch_discount_percent: 50 },
    deployment_types: ['serverless', 'dedicated'], status: 'available', version: 'fp8-quantized', featured: true, created_at: '2026-06-15T00:00:00Z',
  },
  {
    id: 'deepseek-v4-pro', display_name: 'DeepSeek V4 Pro', author: 'DeepSeek',
    category: 'chat', description: "DeepSeek's most capable model with Mixture of Experts architecture and long context.",
    capabilities: { context_window: 262144, max_output_tokens: 8192, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 1.20, output_per_1m_tokens: 2.40 }, batch_discount_percent: 50 },
    deployment_types: ['serverless', 'dedicated'], status: 'available', version: 'bf16', featured: true, created_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'qwen-2.5-72b', display_name: 'Qwen 2.5 72B', author: 'Alibaba',
    category: 'chat', description: "Alibaba's 72B model excelling at coding, math, and multilingual tasks.",
    capabilities: { context_window: 131072, max_output_tokens: 8192, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: true },
    pricing: { serverless: { input_per_1m_tokens: 0.90, output_per_1m_tokens: 0.90 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'], status: 'available', version: 'fp8-quantized', featured: true, created_at: '2026-06-25T00:00:00Z',
  },
  {
    id: 'llama-3.1-8b-instruct', display_name: 'Llama 3.1 8B Instruct', author: 'Meta',
    category: 'chat', description: 'Fast and affordable 8B model for lightweight tasks and high-throughput applications.',
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: true },
    pricing: { serverless: { input_per_1m_tokens: 0.06, output_per_1m_tokens: 0.06 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'], status: 'available', version: 'fp8-quantized', featured: true, created_at: '2026-06-30T00:00:00Z',
  },
  {
    id: 'llama-3.2-vision-90b', display_name: 'Llama 3.2 Vision 90B', author: 'Meta',
    category: 'chat', description: "Meta's multimodal vision-language model for image understanding tasks.",
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: false, tool_calling: false, multi_modal: true, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 1.50, output_per_1m_tokens: 3.00 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'], status: 'available', version: 'fp16', featured: false, created_at: '2026-07-01T00:00:00Z',
  },
];

export const MODEL_DETAILS: Record<string, any> = {};
MOCK_MODELS.forEach((m) => {
  MODEL_DETAILS[m.id] = {
    ...m,
    usage_examples: {
      curl: `curl https://api.ultralisk.com/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\\n  -d '{"model":"${m.id}","messages":[{"role":"user","content":"Hello!"}]}'`,
      python: `from openai import OpenAI\n\nclient = OpenAI(\n  base_url="https://api.ultralisk.com/v1",\n  api_key="your-ultralisk-api-key"\n)\n\nresponse = client.chat.completions.create(\n  model="${m.id}",\n  messages=[{"role":"user","content":"Hello!"}]\n)\nprint(response.choices[0].message.content)`,
      typescript: `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: 'https://api.ultralisk.com/v1',\n  apiKey: 'your-ultralisk-api-key',\n});\n\nconst response = await client.chat.completions.create({\n  model: '${m.id}',\n  messages: [{ role: 'user', content: 'Hello!' }],\n});\nconsole.log(response.choices[0].message.content);`,
    },
  };
});

export const MOCK_USAGE = {
  period: { from: '2026-07-01T00:00:00Z', to: '2026-07-10T23:59:59Z' },
  totals: { requests: 12450, input_tokens: 3_200_000, output_tokens: 890_000, cost_usd: 12.47 },
  by_model: [
    { model_id: 'llama-3.3-70b-instruct', model_display_name: 'Llama 3.3 70B', requests: 5200, input_tokens: 1_500_000, output_tokens: 400_000, cost_usd: 5.62 },
    { model_id: 'llama-3.1-8b-instruct', model_display_name: 'Llama 3.1 8B', requests: 6800, input_tokens: 1_600_000, output_tokens: 450_000, cost_usd: 6.84 },
  ],
  by_key: [
    { key_id: 'key_001', key_name: 'Production', key_prefix: 'ultr_...a1b', requests: 10000, input_tokens: 2_800_000, output_tokens: 750_000, cost_usd: 10.20 },
    { key_id: 'key_002', key_name: 'Development', key_prefix: 'ultr_...c2d', requests: 2450, input_tokens: 400_000, output_tokens: 140_000, cost_usd: 2.27 },
  ],
  recent_activity: Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    model_id: i % 2 === 0 ? 'llama-3.1-8b-instruct' : 'llama-3.3-70b-instruct',
    status_code: [200, 200, 200, 200, 200, 200, 200, 429, 500, 200][i],
    latency_ms: Math.floor(Math.random() * 500) + 100,
    tokens: Math.floor(Math.random() * 2000) + 100,
  })),
};

export const MOCK_BILLING = {
  balance_usd: 87.53,
  monthly_budget_usd: 100.00,
  month_to_date_spend_usd: 12.47,
  estimated_month_end_usd: 37.41,
  auto_recharge_enabled: true,
  invoices: [
    { id: 'inv_007', period: '2026-07', amount_usd: 12.47, status: 'pending' as const, download_url: '#', issued_at: '2026-07-01T00:00:00Z' },
    { id: 'inv_006', period: '2026-06', amount_usd: 45.20, status: 'paid' as const, download_url: '#', issued_at: '2026-06-01T00:00:00Z' },
    { id: 'inv_005', period: '2026-05', amount_usd: 32.80, status: 'paid' as const, download_url: '#', issued_at: '2026-05-01T00:00:00Z' },
  ],
};

export const MOCK_API_KEYS = [
  { id: 'key_001', name: 'Production', prefix: 'ultr_...a1b', role: 'admin' as const, model_allowlist: null, monthly_quota_usd: 50, usage_this_month_usd: 10.20, created_by: 'Alice Developer', created_at: '2026-07-01T00:00:00Z', last_used_at: '2026-07-10T14:30:00Z', revoked_at: null, status: 'active' as const },
  { id: 'key_002', name: 'Development', prefix: 'ultr_...c2d', role: 'developer' as const, model_allowlist: ['llama-3.1-8b-instruct'], monthly_quota_usd: 25, usage_this_month_usd: 2.27, created_by: 'Alice Developer', created_at: '2026-07-03T00:00:00Z', last_used_at: '2026-07-10T12:15:00Z', revoked_at: null, status: 'active' as const },
];

export const MOCK_ENDPOINTS = [
  {
    id: 'ep_001', name: 'llama-prod', model_id: 'llama-3.3-70b-instruct', type: 'dedicated',
    replicas: 2, gpu_spec: { type: 'H100', count: 2 },
    autoscaling_policy: { min_replicas: 1, max_replicas: 4, target_cpu_util: 70 },
    metrics: { qps: 45.2, ttft_p95_ms: 320, tpot_ms: 45, error_rate: 0.02, gpu_util: 68 },
    status: 'active', created_at: '2026-07-05T00:00:00Z',
  },
  {
    id: 'ep_002', name: 'deepseek-reserved', model_id: 'deepseek-v4-pro', type: 'reserved',
    replicas: 1, gpu_spec: { type: 'H100', count: 1 },
    autoscaling_policy: { min_replicas: 1, max_replicas: 2, target_cpu_util: 80 },
    metrics: { qps: 12.1, ttft_p95_ms: 510, tpot_ms: 72, error_rate: 0.01, gpu_util: 55 },
    status: 'active', created_at: '2026-07-08T00:00:00Z',
  },
  {
    id: 'ep_003', name: 'qwen-dev', model_id: 'qwen-2.5-72b', type: 'reserved',
    replicas: 1, gpu_spec: { type: 'H100', count: 1 }, autoscaling_policy: null,
    metrics: { qps: 3.4, ttft_p95_ms: 890, tpot_ms: 120, error_rate: 0.05, gpu_util: 22 },
    status: 'degraded', created_at: '2026-07-09T00:00:00Z',
  },
];

export const MOCK_BATCH_JOBS = [
  { id: 'batch_001', name: 'summarization-jul9', model_id: 'llama-3.3-70b-instruct', status: 'completed', input_file: 'summaries_input.jsonl', output_file: 'summaries_output.jsonl', callback_url: null, token_count: 1_250_000, cost: 0.74, created_at: '2026-07-09T10:00:00Z', completed_at: '2026-07-09T10:45:00Z', error_log: null },
  { id: 'batch_002', name: 'classification-batch', model_id: 'llama-3.1-8b-instruct', status: 'running', input_file: 'classify_input.jsonl', output_file: null, callback_url: 'https://hooks.example.com/classify-done', token_count: 320_000, cost: null, created_at: '2026-07-10T14:00:00Z', completed_at: null, error_log: null },
  { id: 'batch_003', name: 'embeddings-v2', model_id: 'qwen-2.5-72b', status: 'failed', input_file: 'embeddings_input.jsonl', output_file: null, callback_url: null, token_count: 50_000, cost: 0.03, created_at: '2026-07-08T09:00:00Z', completed_at: '2026-07-08T09:05:00Z', error_log: [{ line: 142, error: 'Invalid JSON format - unterminated string' }] },
  { id: 'batch_004', name: 'bulk-translate', model_id: 'llama-3.1-8b-instruct', status: 'pending', input_file: 'translate_input.jsonl', output_file: null, callback_url: 'https://hooks.example.com/translate-done', token_count: null, cost: null, created_at: '2026-07-10T15:30:00Z', completed_at: null, error_log: null },
];

export const MOCK_SESSIONS = [
  { id: 'sess_001', name: 'API Design Discussion', model_id: 'llama-3.3-70b-instruct', messages: [{ role: 'user', content: 'Design a REST API for a task queue' }, { role: 'assistant', content: 'Here is a REST API design for a task queue...' }], created_at: '2026-07-10T10:00:00Z', updated_at: '2026-07-10T10:30:00Z' },
  { id: 'sess_002', name: 'Code Review', model_id: 'llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'Review this TypeScript code...' }], created_at: '2026-07-10T11:00:00Z', updated_at: '2026-07-10T11:05:00Z' },
];

export const MOCK_CLUSTERS = [
  { id: 'cl_001', name: 'us-east-1-prod', region: 'us-east-1', gpu_type: 'H100', node_count: 8, healthy_nodes: 8, status: 'healthy', avg_gpu_util: 67 },
  { id: 'cl_002', name: 'us-west-2-prod', region: 'us-west-2', gpu_type: 'H100', node_count: 4, healthy_nodes: 3, status: 'degraded', avg_gpu_util: 82 },
  { id: 'cl_003', name: 'eu-central-1-dev', region: 'eu-central-1', gpu_type: 'A100', node_count: 2, healthy_nodes: 2, status: 'healthy', avg_gpu_util: 34 },
];

const NOW = Date.now();
function ts(minAgo: number): string { return new Date(NOW - minAgo * 60000).toISOString(); }

export const MOCK_NODES: Record<string, any[]> = {
  cl_001: [
    { id: 'node_001', cluster_id: 'cl_001', hostname: 'gpu-n01', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_002', cluster_id: 'cl_001', hostname: 'gpu-n02', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_003', cluster_id: 'cl_001', hostname: 'gpu-n03', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_004', cluster_id: 'cl_001', hostname: 'gpu-n04', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_005', cluster_id: 'cl_001', hostname: 'gpu-n05', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_006', cluster_id: 'cl_001', hostname: 'gpu-n06', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'degraded' },
    { id: 'node_007', cluster_id: 'cl_001', hostname: 'gpu-n07', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_008', cluster_id: 'cl_001', hostname: 'gpu-n08', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'offline' },
  ],
  cl_002: [
    { id: 'node_009', cluster_id: 'cl_002', hostname: 'gpu-w01', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_010', cluster_id: 'cl_002', hostname: 'gpu-w02', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_011', cluster_id: 'cl_002', hostname: 'gpu-w03', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'degraded' },
    { id: 'node_012', cluster_id: 'cl_002', hostname: 'gpu-w04', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
  ],
  cl_003: [
    { id: 'node_013', cluster_id: 'cl_003', hostname: 'gpu-e01', gpu_model: 'A100', gpu_count: 4, driver_version: '550.54.15', cuda_version: '12.4', status: 'online' },
    { id: 'node_014', cluster_id: 'cl_003', hostname: 'gpu-e02', gpu_model: 'A100', gpu_count: 4, driver_version: '550.54.15', cuda_version: '12.4', status: 'online' },
  ],
};

function generateGpuCards(nodeId: string, count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({
    id: nodeId + '-gpu' + i, node_id: nodeId, index: i,
    utilization_percent: Math.floor(Math.random() * 30 + 50),
    memory_used: Math.floor(Math.random() * 20 + 60), memory_total: 80,
    temperature: Math.floor(Math.random() * 15 + 60),
    processes: i % 2 === 0 ? [{ pid: 12345 + i, name: 'vllm', memory_mb: 10240 + i * 512 }] : [],
    metrics: Array.from({ length: 30 }, (_, j) => ({
      metric_name: 'gpu_util', timestamp: ts(j * 2), value: Math.floor(Math.random() * 40 + 40),
    })),
  }));
}

export const MOCK_GPU_CARDS: Record<string, any[]> = {};
for (const [clusterId, nodes] of Object.entries(MOCK_NODES)) {
  for (const node of nodes) {
    MOCK_GPU_CARDS[node.id] = generateGpuCards(node.id, node.gpu_count);
  }
}

export const MOCK_DEPLOYMENTS = [
  { id: 'dep_001', name: 'llama-3.3-70b', model_id: 'llama-3.3-70b-instruct', endpoint_id: 'ep_001', cluster_id: 'cl_001', replicas: 2, gpu_per_replica: 1, status: 'active', created_at: ts(1440) },
  { id: 'dep_002', name: 'deepseek-v4-pro', model_id: 'deepseek-v4-pro', endpoint_id: 'ep_002', cluster_id: 'cl_001', replicas: 1, gpu_per_replica: 1, status: 'active', created_at: ts(720) },
  { id: 'dep_003', name: 'qwen-2.5-72b', model_id: 'qwen-2.5-72b', endpoint_id: null, cluster_id: 'cl_002', replicas: 1, gpu_per_replica: 2, status: 'degraded', created_at: ts(360) },
  { id: 'dep_004', name: 'llama-3.1-8b', model_id: 'llama-3.1-8b-instruct', endpoint_id: null, cluster_id: 'cl_003', replicas: 2, gpu_per_replica: 1, status: 'active', created_at: ts(180) },
];

export const MOCK_DEPLOYMENT_VERSIONS: Record<string, any[]> = {
  dep_001: [
    { version: 3, deployed_at: ts(120), status: 'active', image: 'vllm:v0.8.3-llama33' },
    { version: 2, deployed_at: ts(600), status: 'rolled_back', image: 'vllm:v0.8.2' },
    { version: 1, deployed_at: ts(1440), status: 'rolled_back', image: 'vllm:v0.8.1' },
  ],
  dep_002: [
    { version: 2, deployed_at: ts(360), status: 'active', image: 'vllm:v0.8.3-deepseek' },
    { version: 1, deployed_at: ts(720), status: 'rolled_back', image: 'vllm:v0.8.2' },
  ],
  dep_003: [
    { version: 1, deployed_at: ts(360), status: 'active', image: 'vllm:v0.8.2-qwen' },
  ],
  dep_004: [
    { version: 2, deployed_at: ts(60), status: 'active', image: 'vllm:v0.8.3-llama8b' },
    { version: 1, deployed_at: ts(180), status: 'rolled_back', image: 'vllm:v0.7.1' },
  ],
};

// === GPU Utilization (Phase 2b) ===
const __HOURS = Array.from({ length: 72 }, (_, i) => new Date(Date.now() - (71 - i) * 3600000).toISOString());

// === Cost Analytics (Phase 2c) ===
export const MOCK_COST_DATA = {
  summary: { total_cost_usd: 18420.35, token_cost_usd: 12530.80, gpu_hour_cost_usd: 5889.55, budget_usd: 25000, budget_used_pct: 73.7, estimated_month_end_usd: 27300 },
  by_dimension: {
    model: [
      { name: 'Llama 3.3 70B', cost_usd: 8420.50, gpu_hours: 1250, tokens_m: 14200, pct: 45.7 },
      { name: 'DeepSeek V4 Pro', cost_usd: 5210.30, gpu_hours: 780, tokens_m: 4350, pct: 28.3 },
      { name: 'Qwen 2.5 72B', cost_usd: 2850.75, gpu_hours: 420, tokens_m: 3180, pct: 15.5 },
      { name: 'Llama 3.1 8B', cost_usd: 1410.20, gpu_hours: 180, tokens_m: 28400, pct: 7.7 },
      { name: 'Llama 3.2 Vision 90B', cost_usd: 528.60, gpu_hours: 95, tokens_m: 180, pct: 2.9 },
    ],
    endpoint: [
      { name: 'llama-prod', cost_usd: 6320.00, gpu_hours: 940, tokens_m: 10650, pct: 34.3 },
      { name: 'deepseek-reserved', cost_usd: 5210.30, gpu_hours: 780, tokens_m: 4350, pct: 28.3 },
      { name: 'serverless-default', cost_usd: 4210.50, gpu_hours: 450, tokens_m: 21500, pct: 22.9 },
      { name: 'qwen-dev', cost_usd: 1970.05, gpu_hours: 290, tokens_m: 2230, pct: 10.7 },
      { name: 'batch-processing', cost_usd: 709.50, gpu_hours: 85, tokens_m: 7890, pct: 3.9 },
    ],
    api_key: [
      { name: 'Production', cost_usd: 10230.00, gpu_hours: 1520, tokens_m: 32100, pct: 55.5 },
      { name: 'Development', cost_usd: 5110.20, gpu_hours: 760, tokens_m: 16200, pct: 27.7 },
      { name: 'ML Research', cost_usd: 2850.35, gpu_hours: 420, tokens_m: 4800, pct: 15.5 },
      { name: 'CI/CD', cost_usd: 229.80, gpu_hours: 25, tokens_m: 680, pct: 1.2 },
    ],
    team: [
      { name: 'Platform Engineering', cost_usd: 8210.50, gpu_hours: 1220, tokens_m: 21500, pct: 44.6 },
      { name: 'ML Research', cost_usd: 5620.30, gpu_hours: 840, tokens_m: 8700, pct: 30.5 },
      { name: 'Data Science', cost_usd: 2810.75, gpu_hours: 380, tokens_m: 5400, pct: 15.3 },
      { name: 'Internal Tools', cost_usd: 1778.80, gpu_hours: 185, tokens_m: 4800, pct: 9.7 },
    ],
  },
  daily_cost_trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    token_cost: Math.floor(Math.random() * 200 + 300 + i * 5),
    gpu_cost: Math.floor(Math.random() * 100 + 120 + i * 3),
  })),
  budget_alerts: {
    budget_usd: 25000, current_spend: 18420.35, alerts_enabled: true,
    channels: ['email', 'slack'],
    thresholds: [
      { label: '70% warning', type: 'percent', value: 70, triggered: true, triggered_at: '2026-07-08T00:00:00Z' },
      { label: '90% critical', type: 'percent', value: 90, triggered: false },
      { label: 'GPU utilization >85%', type: 'gpu_util', value: 85, triggered: true, triggered_at: '2026-07-09T12:00:00Z' },
    ],
    suppression_window_minutes: 30,
  },
};

// === GPU Utilization (Phase 2b) ===
export const MOCK_GPU_UTILIZATION = {
  overview: { total_gpu: 64, avg_utilization: 62, idle_gpu: 14, queued_requests: 3 },
  time_series: __HOURS.map((timestamp: string, i: number) => ({
    timestamp,
    avg_utilization: Math.floor(Math.random() * 40 + 40),
    idle_count: Math.floor(Math.random() * 6 + 2),
    queued_count: Math.floor(Math.random() * 8),
  })),
  per_model: [
    { model_id: 'llama-3.3-70b-instruct', model_display: 'Llama 3.3 70B', gpu_allocated: 24, gpu_utilization: 78, requests_per_sec: 45.2 },
    { model_id: 'llama-3.1-8b-instruct', model_display: 'Llama 3.1 8B', gpu_allocated: 8, gpu_utilization: 92, requests_per_sec: 320.0 },
    { model_id: 'deepseek-v4-pro', model_display: 'DeepSeek V4 Pro', gpu_allocated: 16, gpu_utilization: 55, requests_per_sec: 12.1 },
    { model_id: 'qwen-2.5-72b', model_display: 'Qwen 2.5 72B', gpu_allocated: 8, gpu_utilization: 34, requests_per_sec: 3.4 },
    { model_id: 'llama-3.2-vision-90b', model_display: 'Llama 3.2 Vision 90B', gpu_allocated: 8, gpu_utilization: 41, requests_per_sec: 1.8 },
  ],
  per_tenant: [
    { tenant: 'platform-engineering', gpu_allocated: 32, gpu_utilization: 71, token_usage: 5_200_000, cost_usd: 420.50 },
    { tenant: 'ml-research', gpu_allocated: 16, gpu_utilization: 58, token_usage: 2_800_000, cost_usd: 215.30 },
    { tenant: 'data-science', gpu_allocated: 8, gpu_utilization: 43, token_usage: 890_000, cost_usd: 68.20 },
    { tenant: 'internal-tools', gpu_allocated: 8, gpu_utilization: 29, token_usage: 340_000, cost_usd: 25.80 },
  ],
};
