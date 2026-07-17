-- TOTP two-factor authentication support
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
