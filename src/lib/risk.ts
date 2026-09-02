export type RiskCategory =
  | "customer_fixable"
  | "bank_side"
  | "merchant_side"
  | "healthy";
export type RiskUrgency = "low" | "medium" | "high" | "healthy";

export type RiskRule = {
  id: string;
  signal: string;
  root_cause: string;
  category: RiskCategory;
  recommended_action: string;
  urgency: RiskUrgency;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RiskEvent = {
  id: string;
  event_id: string;
  event_type: string;
  payload: JsonValue;
  event_created_at: string | null;
  received_at: string;
};

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  customer_fixable: "Customer fixable",
  bank_side: "Bank side",
  merchant_side: "Merchant side",
  healthy: "Healthy",
};

export const URGENCY_LABELS: Record<RiskUrgency, string> = {
  healthy: "Healthy",
  low: "Low",
  medium: "Medium",
  high: "High",
};

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function pick(obj: Json | null, key: string): unknown {
  return obj ? obj[key] : undefined;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Keyword heuristics mapping free-text Razorpay error descriptions onto known signals. */
const DESCRIPTION_PATTERNS: Array<{ test: RegExp; signal: string }> = [
  { test: /expir/i, signal: "card_expired" },
  { test: /insufficient|low balance|balance is low/i, signal: "insufficient_funds" },
  { test: /cvv/i, signal: "incorrect_cvv" },
  { test: /limit (has been )?(exceed|reach)|exceeds? (the )?limit/i, signal: "transaction_limit_exceeded" },
  { test: /international/i, signal: "international_card_not_allowed" },
  { test: /block/i, signal: "debit_instrument_blocked" },
  { test: /not (enabled|activated|enrolled).*(online|internet)|online transactions? (are )?(not|dis)/i, signal: "card_disabled_for_online_payments" },
  { test: /timed? ?out|timeout|no response/i, signal: "payment_timed_out" },
  { test: /downtime|technical error|unavailable/i, signal: "bank_technical_error" },
  { test: /authenticat|otp|3ds|3-?d secure/i, signal: "authentication_failed" },
  { test: /fraud|risk check/i, signal: "payment_risk_check_failed" },
  { test: /cancel/i, signal: "payment_cancelled" },
  { test: /declin|do not honou?r|refus/i, signal: "card_declined" },
];

/**
 * Returns candidate signals for an event, most specific first:
 * payment error reason / code, then keywords from the error description,
 * then the event type itself (e.g. `subscription.halted`).
 */
export function extractSignals(eventType: string, payload: unknown): string[] {
  const root = asObject(payload);
  const inner = asObject(pick(root, "payload"));
  const payment = asObject(pick(asObject(pick(inner, "payment")), "entity"));
  const subscription = asObject(pick(asObject(pick(inner, "subscription")), "entity"));
  const invoice = asObject(pick(asObject(pick(inner, "invoice")), "entity"));

  const error =
    asObject(pick(payment, "error")) ??
    asObject(pick(root, "error")) ??
    null;

  const candidates: Array<string | null> = [
    str(pick(error, "reason")),
    str(pick(payment, "error_reason")),
    str(pick(error, "code")),
    str(pick(payment, "error_code")),
  ];

  const description =
    str(pick(error, "description")) ??
    str(pick(payment, "error_description")) ??
    str(pick(invoice, "description"));

  if (description) {
    for (const { test, signal } of DESCRIPTION_PATTERNS) {
      if (test.test(description)) candidates.push(signal);
    }
  }

  const subscriptionStatus = str(pick(subscription, "status"));
  if (subscriptionStatus) candidates.push(`subscription.${subscriptionStatus}`);

  candidates.push(str(eventType));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.toLowerCase();
    if (normalized === "none" || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function matchRule(
  eventType: string,
  payload: unknown,
  rules: RiskRule[],
): { rule: RiskRule | null; signal: string | null } {
  const candidates = extractSignals(eventType, payload);
  const bySignal = new Map(rules.map((r) => [r.signal.toLowerCase(), r]));
  for (const candidate of candidates) {
    const rule = bySignal.get(candidate);
    if (rule) return { rule, signal: candidate };
  }
  return { rule: null, signal: candidates[0] ?? null };
}

/** Reads useful display fields out of a raw Razorpay webhook payload. */
export function summarizeEvent(payload: unknown): {
  subscriptionId: string | null;
  paymentId: string | null;
  amount: number | null;
  currency: string | null;
  errorDescription: string | null;
} {
  const root = asObject(payload);
  const inner = asObject(pick(root, "payload"));
  const payment = asObject(pick(asObject(pick(inner, "payment")), "entity"));
  const subscription = asObject(pick(asObject(pick(inner, "subscription")), "entity"));
  const error = asObject(pick(payment, "error"));
  const amount = pick(payment, "amount");

  return {
    subscriptionId: str(pick(subscription, "id")) ?? str(pick(payment, "subscription_id")),
    paymentId: str(pick(payment, "id")),
    amount: typeof amount === "number" ? amount : null,
    currency: str(pick(payment, "currency")),
    errorDescription: str(pick(error, "description")) ?? str(pick(payment, "error_description")),
  };
}

export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null;
  const value = (amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  return `${currency === "INR" || currency === null ? "₹" : `${currency} `}${value}`;
}

/** Milliseconds between Razorpay creating the event and us receiving it. */
export function detectionLagSeconds(event: RiskEvent): number | null {
  if (!event.event_created_at) return null;
  const lag =
    new Date(event.received_at).getTime() - new Date(event.event_created_at).getTime();
  if (!Number.isFinite(lag) || lag < 0) return null;
  return Math.round(lag / 1000);
}
