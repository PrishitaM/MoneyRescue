import type { JsonValue, RiskRule } from "./risk";

export type MatchedVia = "knowledge_base" | "llm_fallback";
export type ActionStatus = "pending" | "sent" | "skipped" | "flagged_for_review";
export type ActionCategory =
  | "customer_fixable"
  | "bank_side"
  | "merchant_side"
  | "fraud_suspected"
  | "healthy";

/** The four distinct agentic workflows. Healthy events get none. */
export type WorkflowId = "A" | "B" | "C" | "D";

export type AgentAction = {
  id: string;
  event_id: string;
  signal: string;
  matched_via: MatchedVia;
  decision: string;
  reasoning: string;
  category: string;
  channel: string;
  email_subject: string | null;
  email_body: string | null;
  scheduled_for: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  workflow: string | null;
  escalated_at: string | null;
  recovered?: boolean;
  recovered_at?: string | null;
  recovered_amount?: number | null;
};

/** The stopping rules and guardrails actually enforced in the pipeline code. */
export const GUARDRAILS: Array<{ title: string; detail: string; enforcedIn: string }> = [
  {
    title: "One action per event — no duplicates",
    detail:
      "agent_actions is keyed by event_id with a unique index and written through an idempotent upsert, so a replayed webhook or a second cron pass can never send the same customer a second copy of the same recovery email.",
    enforcedIn: "Idempotency",
  },
  {
    title: "Fraud-flagged payments are never retried automatically",
    detail:
      "Any payment blocked by Razorpay's risk engine routes to Workflow D: a neutral failure notice is sent immediately, no retry is scheduled, and the event goes straight to the Review Desk for a human decision.",
    enforcedIn: "Workflow D",
  },
  {
    title: "AI answers at most 2 exchanges, then requires an explicit yes/no",
    detail:
      "The support agent answers a customer's first question, answers the second while appending \"Does this resolve your issue? Please reply YES or NO\", and treats the third reply as the resolution — closing the thread or handing it to a human.",
    enforcedIn: "Support agent",
  },
  {
    title: "Automatic retries stop after one attempt",
    detail:
      "Every failure gets one immediate email. Workflow B then schedules exactly one payment-link retry (+30 minutes); if it does not recover the payment the agent stops retrying and sends a single follow-up email. Workflow C likewise schedules a single +2 day reminder.",
    enforcedIn: "Retry limit",
  },
  {
    title: "Unresolved or unclassifiable events escalate, never guess",
    detail:
      "If no knowledge-base rule matches and the AI fallback is unavailable, the event is marked for human review rather than receiving a generic automated email.",
    enforcedIn: "Escalation",
  },
];

/** Outcome shown in the compliance audit trail. */
export function auditOutcome(action: AgentAction): string {
  if (action.recovered) return "Recovered";
  if (action.escalated_at) return "Escalated";
  if (action.status === "flagged_for_review") return "Held for review";
  if (action.status === "sent") return "Sent";
  if (action.status === "skipped") return "No action";
  return "Pending";
}


export type BusinessAlert = {
  id: string;
  alert_type: string;
  summary: string;
  affected_count: number;
  time_window_start: string;
  time_window_end: string;
  status: string;
  created_at: string;
  event_id: string | null;
};

export type ScheduledRetry = {
  id: string;
  event_id: string;
  retry_at: string;
  executed: boolean;
  created_at: string;
};

export const DECISION_LABELS: Record<string, string> = {
  email_drafted: "Email drafted",
  email_sent: "Email sent",
  retry_scheduled: "Retry scheduled",
  retry_and_email: "Retry scheduled + email",
  retry_executed: "Retry executed",
  retry_recovered: "Retry recovered the payment",
  retry_failed_email_sent: "Retry failed — email sent",
  flagged_fraud: "Flagged for fraud review",
  no_action: "No action needed",
  needs_review: "Needs human review",
};

export const WORKFLOW_LABELS: Record<WorkflowId, string> = {
  A: "Immediate fix request",
  B: "Immediate notice + auto retry",
  C: "Immediate notice — retry in 2 days",
  D: "Immediate notice — held for review",
};

export const WORKFLOW_ESCALATED_LABEL = "Retry failed — second email sent";

export const WORKFLOW_DESCRIPTIONS: Record<WorkflowId, string> = {
  A: "Retrying cannot help — only the customer can fix this. One email goes out immediately with instructions written for this exact reason. No retry is scheduled.",
  B: "Transient bank or gateway fault. One notice email goes out immediately, and a payment-link retry is scheduled for +30 minutes. If that retry also fails, a second email follows.",
  C: "Balance was short at charge time. A short, low-pressure notice goes out now, and a separate payment-link reminder is scheduled for +2 days, near likely payday.",
    D: "Razorpay's risk engine blocked this payment. A neutral failure notice goes out immediately, no retry is attempted, and the event goes to the Review Desk for human review.",
};

/** Human-readable label for an action, folding in the workflow-B escalation state. */
export function workflowBadgeLabel(action: {
  workflow: string | null;
  escalated_at: string | null;
}): string | null {
  if (!action.workflow) return null;
  if (action.workflow === "B" && action.escalated_at) return WORKFLOW_ESCALATED_LABEL;
  return WORKFLOW_LABELS[action.workflow as WorkflowId] ?? action.workflow;
}

/** Razorpay failure reasons that are transient on the bank/gateway side — retry first, no email. */
export const TRANSIENT_BANK_SIGNALS = new Set([
  "payment_timed_out",
  "gateway_technical_error",
  "bank_technical_error",
  "bank_downtime",
  "gateway_timeout",
  "payment_declined_by_bank",
  "payment_failed",
  "card_declined",
  "server_error",
]);

/** Signals Razorpay raises when its risk engine blocks a payment. Never auto-contact the customer. */
export const FRAUD_SIGNALS = new Set([
  "payment_risk_check_failed",
  "payment_pending_risk_check",
  "fraudulent_payment",
]);

export function isFraudSignal(signal: string | null, rule: RiskRule | null): boolean {
  if (signal && FRAUD_SIGNALS.has(signal.toLowerCase())) return true;
  return rule?.category === ("fraud_suspected" as RiskRule["category"]);
}

/**
 * Per-signal email briefs. These are what make workflow A's emails genuinely
 * different from one another rather than one template with the reason swapped in.
 */
export type EmailBrief = {
  /** What the email is for, in one line — drives the subject. */
  purpose: string;
  /** The single concrete instruction the customer should follow. */
  instruction: string;
  /** Whether the secure payment/card link belongs in the email. */
  includeLink: boolean;
};

const LINK = "https://pay.example.com/update-card";

export const PAYMENT_LINK = LINK;

const SIGNAL_BRIEFS: Record<string, EmailBrief> = {
  card_expired: {
    purpose: "the saved card has passed its expiry date, so the bank can no longer authorise charges",
    instruction:
      "Add the new card (or the reissued one with the updated expiry) on the secure page. Nothing else needs changing and the renewal will go through on the new details.",
    includeLink: true,
  },
  incorrect_cvv: {
    purpose: "the CVV sent with the charge did not match the one the bank has on record",
    instruction:
      "Re-enter the three digits printed on the back of the card on the secure page. The card itself is fine — only the CVV needs correcting.",
    includeLink: true,
  },
  card_disabled_for_online_payments: {
    purpose: "online and e-commerce transactions are switched off on this card",
    instruction:
      "Open your bank's app or net banking, turn on online / e-commerce transactions for this card under card controls, then confirm the payment on the secure page. No new card is needed.",
    includeLink: true,
  },
  card_not_enrolled: {
    purpose: "the card is not enrolled for secure online authentication with the issuing bank",
    instruction:
      "Ask your bank to enrol the card for online (3D Secure) transactions, or use a card that is already enrolled, then complete the payment on the secure page.",
    includeLink: true,
  },
  transaction_limit_exceeded: {
    purpose: "the charge was above the per-transaction limit set on the card",
    instruction:
      "Raise the per-transaction or e-commerce limit in your bank's app, or use a different card, then complete the payment on the secure page.",
    includeLink: true,
  },
  debit_instrument_blocked: {
    purpose: "the bank has placed a block on this card",
    instruction:
      "Contact your bank to have the block lifted — they will usually do it on the call — then complete the payment on the secure page.",
    includeLink: true,
  },
  debit_instrument_inactive: {
    purpose: "the card is not active yet, so the bank rejected the charge",
    instruction:
      "Activate the card with your bank (usually a one-time step in their app), or use an active card, then complete the payment on the secure page.",
    includeLink: true,
  },
  authentication_failed: {
    purpose: "the OTP / 3D Secure step was not completed, so the bank stopped the charge",
    instruction:
      "Start the payment again on the secure page and complete the OTP prompt from your bank within the time it allows. Keep the registered phone handy.",
    includeLink: true,
  },
  payment_cancelled: {
    purpose: "the payment was closed before it finished",
    instruction: "Complete the payment on the secure page whenever convenient.",
    includeLink: true,
  },
  international_card_not_allowed: {
    purpose:
      "the card is issued outside India and international payments are not enabled on our account yet — this is on our side, not yours",
    instruction:
      "No action is needed from you. Our team is enabling international cards; if you would rather not wait, an Indian card can be added on the secure page.",
    includeLink: true,
  },
};

const DEFAULT_BRIEF: EmailBrief = {
  purpose: "the renewal charge could not be completed",
  instruction:
    "Review the payment method on the secure page and complete the charge so access continues without interruption.",
  includeLink: true,
};

export const HEADS_UP_BRIEF: EmailBrief = {
  purpose:
    "the card did not have enough balance at the time of the charge — no action is needed right now",
  instruction:
    "There is nothing to do at this moment. We will automatically try the charge again in two days, and access stays active until then.",
  includeLink: false,
};

/** Workflow B's immediate notice: transient bank/gateway fault, retry already scheduled. */
export const BANK_NOTICE_BRIEF: EmailBrief = {
  purpose:
    "a temporary fault at the bank or payment gateway stopped the renewal charge — nothing is wrong with the card",
  instruction:
    "No action is needed from you. We will automatically attempt the charge again in about 30 minutes, and access stays active in the meantime. If you would prefer to settle it right away, the secure payment link below works too.",
  includeLink: true,
};

export const NUDGE_BRIEF: EmailBrief = {
  purpose:
    "two days have passed since the renewal charge fell short on balance, so here is the payment link",
  instruction:
    "Complete the renewal on the secure payment link at your convenience. If the balance is now available, one tap is all it takes.",
  includeLink: true,
};

export const ESCALATION_BRIEF: EmailBrief = {
  purpose:
    "a temporary bank or gateway fault stopped the charge, and our automatic second attempt did not go through either",
  instruction:
    "Please complete the renewal yourself on the secure payment link. This was our second attempt, so a manual payment is the quickest way to close it out.",
  includeLink: true,
};

export function briefForSignal(signal: string): EmailBrief {
  return SIGNAL_BRIEFS[signal.toLowerCase()] ?? DEFAULT_BRIEF;
}

export type RecoveryPlan = {
  workflow: WorkflowId | null;
  decision: keyof typeof DECISION_LABELS;
  category: ActionCategory;
  channel: "email" | "retry" | "retry+email" | "none" | "business_review";
  reasoning: string;
  retryDelayMinutes: number | null;
  wantsEmail: boolean;
  status: ActionStatus;
};

const RETRY_30_MIN = 30;
const RETRY_2_DAYS = 60 * 24 * 2;

/** Workflow D — fraud. Sends an immediate neutral notice, but never retries automatically. */
export function workflowDPlan(reason: string): RecoveryPlan {
  return {
    workflow: "D",
    decision: "flagged_fraud",
    category: "fraud_suspected",
    channel: "email",
    reasoning: `${reason} Held for human review with no automatic retry. A neutral payment-failure email is sent immediately without exposing fraud screening details.`,
    retryDelayMinutes: null,
    wantsEmail: true,
    status: "flagged_for_review",
  };
}

/** Workflow A — the customer must act, so one tailored email goes out now and no retry is scheduled. */
export function workflowAPlan(reason: string, category: ActionCategory): RecoveryPlan {
  return {
    workflow: "A",
    decision: "email_drafted",
    category,
    channel: "email",
    reasoning: `${reason} Retrying the same card cannot help, so we send one email immediately with instructions for this exact reason and schedule no retry.`,
    retryDelayMinutes: null,
    wantsEmail: true,
    status: "pending",
  };
}

/** Workflow B — immediate notice now, plus one automatic retry; escalation email if the retry fails. */
export function workflowBPlan(reason: string): RecoveryPlan {
  return {
    workflow: "B",
    decision: "retry_and_email",
    category: "bank_side",
    channel: "retry+email",
    reasoning: `${reason} This is transient on the bank/gateway side, so one notice email goes out immediately and a payment-link retry is scheduled for 30 minutes from now. A second email follows only if that retry also fails.`,
    retryDelayMinutes: RETRY_30_MIN,
    wantsEmail: true,
    status: "pending",
  };
}

/** Workflow C — heads-up now, payment-link reminder in two days. */
export function workflowCPlan(): RecoveryPlan {
  return {
    workflow: "C",
    decision: "retry_and_email",
    category: "customer_fixable",
    channel: "retry+email",
    reasoning:
      "Balance was short at charge time. A low-pressure heads-up goes out now (no action requested yet) and a separate payment-link reminder is scheduled for 2 days out, near likely payday.",
    retryDelayMinutes: RETRY_2_DAYS,
    wantsEmail: true,
    status: "pending",
  };
}

export function healthyPlan(): RecoveryPlan {
  return {
    workflow: null,
    decision: "no_action",
    category: "healthy",
    channel: "none",
    reasoning: "Payment succeeded — tracked as a healthy baseline, no recovery needed.",
    retryDelayMinutes: null,
    wantsEmail: false,
    status: "skipped",
  };
}

/**
 * Deterministic knowledge-base routing into one of the four workflows.
 * No LLM involved — the matched rule row and the signal decide.
 */
export function resolveWorkflow(signal: string, rule: RiskRule): RecoveryPlan {
  const normalized = signal.toLowerCase();

  if (isFraudSignal(normalized, rule)) {
    return workflowDPlan(rule.root_cause);
  }

  if (rule.category === "healthy" || rule.urgency === "healthy") {
    return healthyPlan();
  }

  if (normalized === "insufficient_funds") {
    return workflowCPlan();
  }

  if (rule.category === "bank_side" && TRANSIENT_BANK_SIGNALS.has(normalized)) {
    return workflowBPlan(rule.root_cause);
  }

  // Everything else (customer-fixable and merchant-side notices) is an immediate,
  // reason-specific email with no retry.
  return workflowAPlan(
    `${rule.root_cause} Recommended action: ${rule.recommended_action}`,
    rule.category as ActionCategory,
  );
}

/** Turns a workflow letter chosen by the LLM into the same plan a rule match would produce. */
export function planFromWorkflowId(workflow: WorkflowId, explanation: string): RecoveryPlan {
  switch (workflow) {
    case "D":
      return workflowDPlan(`AI fallback: ${explanation}`);
    case "B":
      return workflowBPlan(`AI fallback: ${explanation}`);
    case "C": {
      const plan = workflowCPlan();
      return { ...plan, reasoning: `AI fallback: ${explanation} ${plan.reasoning}` };
    }
    default:
      return workflowAPlan(`AI fallback: ${explanation}`, "customer_fixable");
  }
}

export function customerEmailFromPayload(payload: JsonValue): string | null {
  const root = payload as Record<string, unknown> | null;
  const inner = root?.["payload"] as Record<string, unknown> | undefined;
  const payment = (inner?.["payment"] as Record<string, unknown> | undefined)?.["entity"] as
    | Record<string, unknown>
    | undefined;
  const email = payment?.["email"];
  return typeof email === "string" && email.includes("@") ? email : null;
}
