ALTER TABLE smtp_configs
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'smtp',
  ADD COLUMN IF NOT EXISTS api_base_url TEXT NOT NULL DEFAULT 'https://api.resend.com';

ALTER TABLE smtp_configs
  DROP CONSTRAINT IF EXISTS smtp_configs_provider_check;

ALTER TABLE smtp_configs
  ADD CONSTRAINT smtp_configs_provider_check CHECK (provider IN ('smtp', 'resend'));
