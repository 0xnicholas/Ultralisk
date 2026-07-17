import { describe, it, expect } from 'vitest';
import { normalizeModel, buildUsageExamples } from './modelShaping.js';

const baseRow = {
  id: 'llama-3.1-8b-instruct',
  name: 'Llama 3.1 8B Instruct',
  provider: 'Meta',
  description: '8B parameter instruction-tuned model',
  status: 'active',
  context_length: 131072,
  pricing_per_1k_input: '0.000060',
  pricing_per_1k_output: '0.000060',
  capabilities: ['chat', 'completion', 'json_mode', 'tool_calling'],
  created_at: '2026-07-13T01:25:53.107Z',
};

describe('normalizeModel', () => {
  it('maps DB row to UI ModelDetail shape', () => {
    const m = normalizeModel(baseRow);
    expect(m.id).toBe('llama-3.1-8b-instruct');
    expect(m.display_name).toBe('Llama 3.1 8B Instruct');
    expect(m.author).toBe('Meta');
    expect(m.status).toBe('available');
    expect(m.category).toBe('chat');
  });

  it('flattens capabilities into the typed shape the UI expects', () => {
    const m = normalizeModel(baseRow);
    expect(m.capabilities.context_window).toBe(131072);
    expect(m.capabilities.max_output_tokens).toBe(4096); // min(context, 4096)
    expect(m.capabilities.json_mode).toBe(true);
    expect(m.capabilities.tool_calling).toBe(true);
    expect(m.capabilities.multi_modal).toBe(false);
    expect(m.capabilities.fine_tuning).toBe(false);
  });

  it('converts per-1k pricing to per-1M by multiplying by 1000', () => {
    const m = normalizeModel(baseRow);
    expect(m.pricing.serverless.input_per_1m_tokens).toBeCloseTo(0.06, 5);
    expect(m.pricing.serverless.output_per_1m_tokens).toBeCloseTo(0.06, 5);
  });

  it('marks non-active status as unavailable', () => {
    const m = normalizeModel({ ...baseRow, status: 'deprecated' });
    expect(m.status).toBe('unavailable');
  });

  it('attaches a known version to seeded llama models', () => {
    expect(normalizeModel({ ...baseRow, id: 'llama-3.1-8b-instruct' }).version).toBe('8B-Instruct-v1');
    expect(normalizeModel({ ...baseRow, id: 'llama-3.3-70b-instruct' }).version).toBe('70B-Instruct-v1');
  });

  it('falls back to "v1" for unknown model ids', () => {
    expect(normalizeModel({ ...baseRow, id: 'mystery-model' }).version).toBe('v1');
  });

  it('flags only llama-3.1-8b as featured', () => {
    expect(normalizeModel({ ...baseRow, id: 'llama-3.1-8b-instruct' }).featured).toBe(true);
    expect(normalizeModel({ ...baseRow, id: 'llama-3.3-70b-instruct' }).featured).toBe(false);
  });

  it('tolerates missing capabilities (parses [] instead of throwing)', () => {
    const m = normalizeModel({ ...baseRow, capabilities: null });
    expect(m.capabilities.json_mode).toBe(false);
    expect(m.capabilities.context_window).toBe(131072);
  });

  it('tolerates missing description', () => {
    const m = normalizeModel({ ...baseRow, description: null });
    expect(m.description).toBe('');
  });

  it('includes usage_examples so ModelDetailPage does not crash on undefined', () => {
    const m = normalizeModel(baseRow);
    expect(m.usage_examples).toBeDefined();
    expect(m.usage_examples.python).toContain('from openai import OpenAI');
    expect(m.usage_examples.typescript).toContain('from "openai"');
    expect(m.usage_examples.curl).toContain('curl -X POST');
  });

  it('embeds the model id into all three usage snippets', () => {
    const m = normalizeModel({ ...baseRow, id: 'some-model-xyz' });
    expect(m.usage_examples.curl).toContain('"some-model-xyz"');
    expect(m.usage_examples.python).toContain('model="some-model-xyz"');
    expect(m.usage_examples.typescript).toContain('model: "some-model-xyz"');
  });
});

describe('buildUsageExamples', () => {
  it('emits a python snippet that imports openai', () => {
    expect(buildUsageExamples('any-model').python).toContain('from openai import OpenAI');
  });
  it('emits a typescript snippet that imports openai', () => {
    expect(buildUsageExamples('any-model').typescript).toContain('import OpenAI from "openai"');
  });
  it('emits a curl snippet with an Authorization header placeholder', () => {
    expect(buildUsageExamples('any-model').curl).toContain('Authorization: Bearer $ULTRALISK_API_KEY');
  });
});
