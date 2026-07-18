-- Migration 009: Add dedicated billing_email column to orgs
--
-- Previously, organizationUpdate.ts stored billing_email in the slug field
-- as a workaround. This migration adds a proper column and backfills it
-- from slug for any orgs that used the workaround.

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);

-- Backfill: if slug looks like an email, copy it to billing_email
UPDATE orgs
SET billing_email = slug
WHERE billing_email IS NULL
  AND slug LIKE '%@%';
