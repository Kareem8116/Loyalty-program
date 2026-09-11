-- Phase 32: Offline Resilience Feature & Settings Migration

-- 1. Register notify_owner_sync_failure in feature_definitions
INSERT INTO public.feature_definitions (key, name, description)
VALUES (
  'notify_owner_sync_failure',
  'Notify Owner on Sync Failure',
  'Send SMS alert to business owner if an offline cashier transaction fails during synchronization'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Add max_offline_transactions to redemption_rates
ALTER TABLE public.redemption_rates ADD COLUMN IF NOT EXISTS max_offline_transactions INT NOT NULL DEFAULT 25;
