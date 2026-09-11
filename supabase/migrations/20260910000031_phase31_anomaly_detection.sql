-- Phase 31: AI Anomaly Detection Feature Definition
-- Allows Owner to review flagged transactions with AI explanations

INSERT INTO public.feature_definitions (key, name, description)
VALUES (
  'ai_anomaly_detection',
  'AI Anomaly Detection',
  'Smart anomaly detection and AI explanation for suspicious points activity'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;
