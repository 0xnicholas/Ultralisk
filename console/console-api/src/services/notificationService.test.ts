import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

// Import after mocks
import {
  getBudgetAlertSettings,
  wasRecentlyNotified,
  logNotification,
  sendEmail,
  sendSlack,
  checkAndSendBudgetAlerts,
} from './notificationService.js';

const ORG_ID = 'org_001';

beforeEach(() => {
  mockQuery.mockReset();
});

describe('getBudgetAlertSettings', () => {
  it('returns parsed settings when row exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        org_id: ORG_ID,
        budget_usd: 50000,
        alerts_enabled: true,
        channels: ['email', 'slack'],
        suppression_window_minutes: 60,
        thresholds: [{ label: '80% warning', type: 'percent', value: 80 }],
      }],
    });
    const s = await getBudgetAlertSettings(ORG_ID);
    expect(s).not.toBeNull();
    expect(s!.budgetUsd).toBe(50000);
    expect(s!.channels).toEqual(['email', 'slack']);
    expect(s!.suppressionWindowMinutes).toBe(60);
    expect(s!.thresholds).toHaveLength(1);
  });

  it('returns null when no settings row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const s = await getBudgetAlertSettings(ORG_ID);
    expect(s).toBeNull();
  });

  it('provides defaults for missing columns', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ org_id: ORG_ID }] });
    const s = await getBudgetAlertSettings(ORG_ID);
    expect(s).not.toBeNull();
    expect(s!.budgetUsd).toBe(25000);
    expect(s!.channels).toEqual(['email']);
    expect(s!.suppressionWindowMinutes).toBe(30);
    expect(s!.thresholds).toHaveLength(3);
  });
});

describe('wasRecentlyNotified', () => {
  it('returns true when notification exists within window', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{}] });
    const result = await wasRecentlyNotified(ORG_ID, '70% warning', 30);
    expect(result).toBe(true);
  });

  it('returns false when no recent notification', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await wasRecentlyNotified(ORG_ID, '70% warning', 30);
    expect(result).toBe(false);
  });
});

describe('logNotification', () => {
  it('inserts notification log row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await logNotification(ORG_ID, { label: 'test', type: 'percent', value: 70 }, 'email', 1000);
    expect(mockQuery).toHaveBeenCalledOnce();
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe(ORG_ID);
    expect(params[1]).toBe('test');
    expect(params[2]).toBe('percent');
    expect(params[4]).toBe('email');
    expect(params[5]).toBe(1000);
  });
});

describe('sendEmail', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('logs in dev mode without sending', async () => {
    process.env.NODE_ENV = 'development';
    // Should not throw
    await expect(sendEmail('test@example.com', 'Subject', 'Body')).resolves.toBeUndefined();
  });
});

describe('sendSlack', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('logs in dev mode without sending', async () => {
    process.env.NODE_ENV = 'development';
    await expect(sendSlack('https://hooks.slack.com/test', 'Hello')).resolves.toBeUndefined();
  });
});

describe('checkAndSendBudgetAlerts', () => {
  it('skips when settings are absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // getBudgetAlertSettings returns null
    await checkAndSendBudgetAlerts(ORG_ID);
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it('skips when alerts are disabled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_id: ORG_ID, budget_usd: 25000, alerts_enabled: false }],
    });
    await checkAndSendBudgetAlerts(ORG_ID);
    // Only called once (getBudgetAlertSettings), no further queries
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it('checks thresholds and sends notifications for triggered alerts', async () => {
    // getBudgetAlertSettings
    mockQuery.mockResolvedValueOnce({
      rows: [{
        org_id: ORG_ID,
        budget_usd: 1000,
        alerts_enabled: true,
        channels: ['email'],
        suppression_window_minutes: 30,
        thresholds: [{ label: '50% warning', type: 'percent', value: 50 }],
      }],
    });
    // current spend query
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_cost_usd: 600 }], // 60% of $1000, exceeds 50%
    });
    // wasRecentlyNotified query
    mockQuery.mockResolvedValueOnce({ rows: [] }); // not notified recently
    // org admin emails query (for email channel)
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'admin@example.com' }] });
    // logNotification insert
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await checkAndSendBudgetAlerts(ORG_ID);

    // Should have called: settings, spend, suppression check, admin emails, log insert
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });

  it('respects suppression window (does not re-notify)', async () => {
    // getBudgetAlertSettings
    mockQuery.mockResolvedValueOnce({
      rows: [{
        org_id: ORG_ID,
        budget_usd: 1000,
        alerts_enabled: true,
        channels: ['email'],
        suppression_window_minutes: 30,
        thresholds: [{ label: '50% warning', type: 'percent', value: 50 }],
      }],
    });
    // current spend
    mockQuery.mockResolvedValueOnce({ rows: [{ total_cost_usd: 600 }] });
    // wasRecentlyNotified — returns true (suppressed)
    mockQuery.mockResolvedValueOnce({ rows: [{}] });

    await checkAndSendBudgetAlerts(ORG_ID);
    // Should not proceed to send notifications
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
