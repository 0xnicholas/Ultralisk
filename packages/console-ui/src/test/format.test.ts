import { describe, it, expect } from 'vitest';
import { formatCurrency, formatTokens, formatNumber, formatRelativeTime } from '@/utils/format';

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(12.47)).toBe('$12.47');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(18420.35)).toBe('$18,420.35');
  });
});

describe('formatTokens', () => {
  it('formats token counts', () => {
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(2500000)).toBe('2.5M');
  });
});

describe('formatNumber', () => {
  it('formats with locale separators', () => {
    expect(formatNumber(12450)).toBe('12,450');
    expect(formatNumber(100)).toBe('100');
  });
});

describe('formatRelativeTime', () => {
  it('returns relative time strings', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
  });
});
