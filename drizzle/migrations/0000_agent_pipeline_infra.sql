CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'fraud_suspected';

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_event_id_key ON public.agent_actions (event_id);
CREATE INDEX IF NOT EXISTS scheduled_retries_due_idx ON public.scheduled_retries (retry_at) WHERE executed = false;
CREATE INDEX IF NOT EXISTS business_alerts_status_idx ON public.business_alerts (status, created_at DESC);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.cron_config (
  id boolean PRIMARY KEY DEFAULT true,
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  base_url text NOT NULL,
  CONSTRAINT cron_config_singleton CHECK (id)
);
GRANT ALL ON private.cron_config TO service_role;

CREATE OR REPLACE FUNCTION private.call_agent_endpoint(_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, extensions, public
AS $$
DECLARE
  cfg private.cron_config;
  request_id bigint;
BEGIN
  SELECT * INTO cfg FROM private.cron_config WHERE id;
  SELECT net.http_post(
    url := cfg.base_url || _path,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-token', cfg.token),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.call_agent_endpoint(text) FROM PUBLIC;