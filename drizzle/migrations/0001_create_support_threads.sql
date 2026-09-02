CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  original_subject text,
  gmail_thread_id text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'awaiting_question',
  customer_question text,
  ai_answer text,
  customer_confirmation text,
  final_reply text,
  matched_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_threads TO anon;
GRANT SELECT ON public.support_threads TO authenticated;
GRANT ALL ON public.support_threads TO service_role;

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support threads are publicly readable"
  ON public.support_threads FOR SELECT USING (true);

CREATE TRIGGER update_support_threads_updated_at
  BEFORE UPDATE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX support_threads_state_idx ON public.support_threads (state, created_at DESC);