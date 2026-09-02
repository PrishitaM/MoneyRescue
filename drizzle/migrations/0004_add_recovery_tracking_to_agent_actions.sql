ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS recovered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_amount numeric;

CREATE INDEX IF NOT EXISTS agent_actions_recovered_idx ON public.agent_actions (recovered, created_at DESC);