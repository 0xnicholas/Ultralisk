/**
 * Shared constants for the Console API.
 *
 * When updating a value here, also update the corresponding SQL DEFAULT
 * in the relevant migration file.
 *
 * @see drizzle/008_budget_alerts.sql (DEFAULT 25000.0)
 */

/** Default monthly budget in USD when no budget_alert_settings row exists. */
export const DEFAULT_BUDGET_USD = 25_000;

/** A single alert threshold configuration. */
export interface ThresholdConfig {
  label: string;
  type: 'percent' | 'gpu_util';
  value: number;
}

/** Default alert thresholds when no budget_alert_settings row exists. */
export const DEFAULT_ALERT_THRESHOLDS: ThresholdConfig[] = [
  { label: '70% warning', type: 'percent', value: 70 },
  { label: '90% critical', type: 'percent', value: 90 },
  { label: 'GPU utilization >85%', type: 'gpu_util', value: 85 },
];
