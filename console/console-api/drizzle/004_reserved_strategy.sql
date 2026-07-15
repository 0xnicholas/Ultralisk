-- Phase 2 M4: Reserved strategy support
-- Adds TPS guarantee and reserved-specific fields to endpoints

ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS tps_guarantee INTEGER;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Reserved endpoints require a minimum TPS guarantee
COMMENT ON COLUMN endpoints.tps_guarantee IS 'Minimum TPS guarantee for reserved endpoints. NULL for serverless/batch.';
COMMENT ON COLUMN endpoints.priority IS 'Scheduling priority. 0=serverless, 1=reserved, 2=dedicated. Higher wins during resource contention.';
