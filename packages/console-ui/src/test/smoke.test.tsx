import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2);
  });

  it('renders the app without crashing', async () => {
    // Basic import check - if this fails, module resolution is broken
    const { App } = await import('@/App');
    expect(App).toBeDefined();
  });
});
