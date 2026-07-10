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
