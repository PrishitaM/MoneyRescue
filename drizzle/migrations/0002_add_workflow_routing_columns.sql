ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS workflow text,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

ALTER TABLE public.scheduled_retries
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS outcome text;