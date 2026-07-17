// Pure functions for shaping DB rows into the API contract.
// Extracted from routes/models.ts so they can be unit-tested without
// booting express or hitting Postgres.

export function buildUsageExamples(modelId: string): {
  curl: string;
  python: string;
  typescript: string;
} {
  const endpoint = `https://api.ultralisk.ai/v1/chat/completions`;
  const body = JSON.stringify(
    { model: modelId, messages: [{ role: 'user', content: 'Hello!' }], max_tokens: 64 },
    null,
    2
  );
  return {
    curl:
      `curl -X POST "${endpoint}" \\\n` +
      `  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${body.replace(/'/g, "'\\''")}'`,
    python:
      `from openai import OpenAI\n` +
      `\n` +
      `client = OpenAI(\n` +
      `    base_url="https://api.ultralisk.ai/v1",\n` +
      `    api_key=os.environ["ULTRALISK_API_KEY"],\n` +
      `)\n` +
      `\n` +
      `resp = client.chat.completions.create(\n` +
      `    model="${modelId}",\n` +
      `    messages=[{"role": "user", "content": "Hello!"}],\n` +
      `    max_tokens=64,\n` +
      `)\n` +
      `print(resp.choices[0].message.content)`,
    typescript:
      `import OpenAI from "openai";\n` +
      `\n` +
      `const client = new OpenAI({\n` +
      `  baseURL: "https://api.ultralisk.ai/v1",\n` +
      `  apiKey: process.env.ULTRALISK_API_KEY!,\n` +
      `});\n` +
      `\n` +
      `const resp = await client.chat.completions.create({\n` +
      `  model: "${modelId}",\n` +
      `  messages: [{ role: "user", content: "Hello!" }],\n` +
      `  max_tokens: 64,\n` +
      `});\n` +
      `console.log(resp.choices[0].message.content);`,
  };
}

export interface NormalizedModel {
  id: string;
  display_name: string;
  author: string;
  category: 'chat';
  description: string;
  status: 'available' | 'unavailable';
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
      cached_input_per_1m_tokens: number;
    };
    batch_discount_percent: number;
    dedicated: null;
  };
  deployment_types: ['serverless'];
  version: string;
  featured: boolean;
  created_at: string;
  usage_examples: { curl: string; python: string; typescript: string };
}

export function normalizeModel(row: any): NormalizedModel {
  const caps: string[] = Array.isArray(row.capabilities) ? row.capabilities : [];
  const has = (s: string) => caps.includes(s);
  return {
    id: row.id,
    display_name: row.name,
    author: row.provider,
    category: 'chat',
    description: row.description ?? '',
    status: row.status === 'active' ? 'available' : 'unavailable',
    capabilities: {
      context_window: row.context_length ?? 4096,
      max_output_tokens: Math.min(row.context_length ?? 4096, 4096),
      json_mode: has('json_mode'),
      tool_calling: has('tool_calling'),
      multi_modal: has('multi_modal'),
      fine_tuning: has('fine_tuning'),
    },
    pricing: {
      serverless: {
        input_per_1m_tokens: Number(row.pricing_per_1k_input ?? 0) * 1000,
        output_per_1m_tokens: Number(row.pricing_per_1k_output ?? 0) * 1000,
        cached_input_per_1m_tokens: 0,
      },
      batch_discount_percent: 50,
      dedicated: null,
    },
    deployment_types: ['serverless'],
    version:
      row.id === 'llama-3.1-8b-instruct' ? '8B-Instruct-v1'
      : row.id === 'llama-3.3-70b-instruct' ? '70B-Instruct-v1'
      : 'v1',
    featured: row.id === 'llama-3.1-8b-instruct',
    created_at: row.created_at ?? new Date().toISOString(),
    usage_examples: buildUsageExamples(row.id),
  };
}
