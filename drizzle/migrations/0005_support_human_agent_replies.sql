ALTER TABLE public.support_messages DROP CONSTRAINT support_messages_sender_check;
ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_sender_check CHECK (sender = ANY (ARRAY['customer'::text, 'agent'::text, 'human_agent'::text]));
ALTER TABLE public.support_threads ADD COLUMN IF NOT EXISTS human_owned boolean NOT NULL DEFAULT false;
ALTER TABLE public.support_threads ADD COLUMN IF NOT EXISTS human_owned_at timestamptz;