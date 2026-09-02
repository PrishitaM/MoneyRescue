CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id),
  sender text NOT NULL CHECK (sender IN ('customer','agent')),
  subject text,
  body text NOT NULL,
  gmail_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_thread_idx ON public.support_messages(thread_id, created_at);

GRANT SELECT ON public.support_messages TO anon;
GRANT SELECT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support messages are publicly readable"
  ON public.support_messages FOR SELECT USING (true);
