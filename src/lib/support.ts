export type SupportMessage = {
  id: string;
  sender: "customer" | "agent" | "human_agent";
  body: string;
  created_at: string;
};

export type SupportThread = {
  id: string;
  event_id: string | null;
  customer_email: string;
  original_subject: string | null;
  gmail_thread_id: string;
  state: string;
  customer_question: string | null;
  ai_answer: string | null;
  customer_confirmation: string | null;
  final_reply: string | null;
  matched_via: string | null;
  human_owned: boolean;
  human_owned_at?: string | null;
  created_at: string;
  updated_at: string;
  support_messages?: SupportMessage[];
};

export const SUPPORT_STATE_LABELS: Record<string, string> = {
  awaiting_question: "Conversation in progress",
  awaiting_confirmation: "Awaiting YES/NO confirmation",
  closed_satisfied: "Resolved by AI",
  escalated: "Escalated to support executive",
  human_owned: "Handled by support team",
  closed_by_human: "Closed by support team",
};


/** Reads the customer's YES / NO confirmation out of a free-form reply. */
export function readConfirmation(text: string): "yes" | "no" | "unclear" {
  const head = text.toLowerCase().slice(0, 400);
  const yes = /\b(yes|yeah|yep|resolved|solved|sorted|works now|thank you|thanks)\b/.test(head);
  const no = /\b(no|nope|not resolved|still|didn't work|did not work|doesn't work|support|call me|executive|help)\b/.test(
    head,
  );
  if (no && !yes) return "no";
  if (yes && !no) return "yes";
  return "unclear";
}
