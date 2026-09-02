CREATE TYPE public.risk_category AS ENUM ('customer_fixable', 'bank_side', 'merchant_side');
CREATE TYPE public.risk_urgency AS ENUM ('low', 'medium', 'high');

CREATE TABLE public.risk_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal TEXT NOT NULL UNIQUE,
  root_cause TEXT NOT NULL,
  category public.risk_category NOT NULL,
  recommended_action TEXT NOT NULL,
  urgency public.risk_urgency NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_rules TO authenticated;
GRANT ALL ON public.risk_rules TO service_role;
ALTER TABLE public.risk_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Risk rules are publicly readable" ON public.risk_rules FOR SELECT USING (true);
CREATE POLICY "Risk rules are publicly writable" ON public.risk_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Risk rules are publicly updatable" ON public.risk_rules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Risk rules are publicly deletable" ON public.risk_rules FOR DELETE USING (true);

CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  event_created_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are publicly readable" ON public.events FOR SELECT USING (true);

CREATE INDEX events_received_at_idx ON public.events (received_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_risk_rules_updated_at BEFORE UPDATE ON public.risk_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.risk_rules (signal, root_cause, category, recommended_action, urgency) VALUES
('expired_card', 'The saved card has passed its expiry date, so the recurring charge cannot be authorized.', 'customer_fixable', 'Email the customer a secure link to update their card and re-authorize the mandate.', 'high'),
('insufficient_funds', 'The customer''s account or card limit did not have enough balance at the time of the charge.', 'customer_fixable', 'Wait for a retry on a likely payday window and notify the customer to top up or switch payment method.', 'medium'),
('payment_declined_by_bank', 'The issuing bank declined the recurring debit without a specific customer-side reason.', 'bank_side', 'Retry once after 24 hours; if it declines again ask the customer to contact their bank or use another card.', 'medium'),
('invalid_card_details', 'Stored card number, CVV or expiry no longer matches the issuer record (often after card reissue).', 'customer_fixable', 'Ask the customer to re-enter card details and create a fresh mandate.', 'high'),
('card_not_supported_for_recurring', 'The card network or issuer does not permit e-mandate recurring debits on this card.', 'merchant_side', 'Offer UPI AutoPay or net-banking e-mandate as an alternative subscription method.', 'medium'),
('mandate_revoked', 'The customer or their bank cancelled the e-mandate authorizing recurring debits.', 'customer_fixable', 'Confirm intent with the customer and send a new mandate authorization request.', 'high'),
('gateway_timeout', 'The issuer or gateway did not respond in time, so the charge could not be confirmed.', 'bank_side', 'Retry shortly; treat as transient and do not contact the customer on the first occurrence.', 'low'),
('authentication_failed', 'The customer did not complete the required OTP or 3DS authentication step.', 'customer_fixable', 'Resend the authentication link and remind the customer to approve within the validity window.', 'medium'),
('payment.failed', 'A subscription charge attempt failed without a more specific error reason on the payment.', 'bank_side', 'Inspect the raw payload for an error code and add a specific rule; allow the scheduled retry to run.', 'medium'),
('subscription.pending', 'The first retry attempt failed and Razorpay has moved the subscription into a pending state.', 'merchant_side', 'Notify the customer that access is at risk and prompt a payment method update before retries run out.', 'high'),
('subscription.halted', 'All retries were exhausted, so Razorpay halted the subscription and access will be lost.', 'merchant_side', 'Treat as active involuntary churn: reach out immediately with a recovery link and manual charge option.', 'high'),
('subscription.charged', 'The recurring charge succeeded and the subscription is healthy.', 'bank_side', 'No action needed; use as a baseline for recovery-rate reporting.', 'low');