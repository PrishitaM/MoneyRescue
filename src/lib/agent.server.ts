/**
 * Server-only recovery agent: classification -> workflow routing -> execution.
 * Never imported by components; reached through agent.functions.ts and cron routes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { matchRule, summarizeEvent, formatAmount, type RiskEvent, type RiskRule } from "./risk";
import {
  ESCALATION_BRIEF,
  BANK_NOTICE_BRIEF,

  HEADS_UP_BRIEF,
  NUDGE_BRIEF,
  PAYMENT_LINK,
  briefForSignal,
  customerEmailFromPayload,
  isFraudSignal,
  planFromWorkflowId,
  resolveWorkflow,
  type EmailBrief,
  type RecoveryPlan,
  type WorkflowId,
} from "./agent";
import { readSmtpConfig, sendMailViaSmtp } from "./smtp.server";

type Admin = SupabaseClient<Database>;

const EVENT_COLUMNS = "id, event_id, event_type, payload, event_created_at, received_at";
const HEALTHY_EVENT_TYPES = ["payment.captured", "payment.authorized"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** Verifies the shared token pg_cron presents on the public cron routes. */
export async function verifyCronToken(request: Request): Promise<boolean> {
  const presented = request.headers.get("x-cron-token");
  const expected = process.env["CRON_TOKEN"];
  if (!presented || !expected) {
    if (!expected) console.error("CRON_TOKEN is not configured");
    return false;
  }
  if (presented.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------- LLM fallback

type LlmVerdict = {
  workflow: WorkflowId;
  plain_english_explanation: string;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env["LLM_MODEL"] ?? "openai/gpt-oss-120b";

export async function callLlm(
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  const key = process.env["LLM_API_KEY"];
  if (!key) {
    console.error("LLM_API_KEY is not configured");
    return null;
  }
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("Groq request failed", res.status, (await res.text()).slice(0, 400));
    return null;
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? null;
}

/**
 * The LLM's job for an unknown signal is to pick the workflow (A/B/C/D),
 * not merely to describe the failure. The chosen letter then runs the exact
 * same code path a knowledge-base match would.
 */
async function pickWorkflowWithLlm(input: {
  signal: string | null;
  eventType: string;
  errorDescription: string | null;
  amount: string | null;
}): Promise<LlmVerdict | null> {
  const content = await callLlm([
    {
      role: "system",
      content:
        "You route failed Razorpay card payments for an Indian SaaS business into exactly one of four recovery workflows. " +
        'Reply ONLY with JSON: {"workflow":"A"|"B"|"C"|"D","plain_english_explanation":string}. ' +
        "A = Immediate Fix Request: only the customer can fix it (card expired, wrong CVV, online payments disabled, limits, blocked card, failed OTP, merchant-side config). No retry helps. " +
        "B = Immediate Notice + Retry: a transient bank or gateway fault (downtime, technical error, timeout, generic decline by the bank). Notify the customer immediately and retry once. " +
        "C = Delayed Nudge: the account simply lacked balance at charge time, so waiting a couple of days is the right move. " +
        "D = Hold for Human: fraud or a risk-engine block. Send a neutral immediate failure notice, never retry, and hold for human review. " +
        "The explanation is one sentence, plain English, no markdown.",
    },
    {
      role: "user",
      content: JSON.stringify({
        razorpay_event: input.eventType,
        error_reason_or_code: input.signal,
        error_description: input.errorDescription,
        amount: input.amount,
      }),
    },
  ]);
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Partial<LlmVerdict>;
    const workflow = (parsed.workflow ?? "").toString().trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(workflow)) return null;
    return {
      workflow: workflow as WorkflowId,
      plain_english_explanation:
        parsed.plain_english_explanation ?? "Routed by the AI fallback from the raw error text.",
    };
  } catch {
    console.error("Groq returned non-JSON content");
    return null;
  }
}

// ---------------------------------------------------------------- email drafting

function describeDelay(minutes: number): string {
  if (minutes < 60) return `in about ${minutes} minutes`;
  if (minutes < 60 * 24) return `in about ${Math.round(minutes / 60)} hour(s)`;
  return `in ${Math.round(minutes / 60 / 24)} day(s)`;
}

type DraftInput = {
  brief: EmailBrief;
  signal: string;
  amount: string | null;
  errorDescription: string | null;
  /** Null when this email is not accompanied by an automatic retry. */
  retryDescription: string | null;
  /** Marks the second-attempt escalation email of workflow B. */
  secondAttempt?: boolean;
  subjectHint: string;
};

/**
 * Writes the customer email for one specific brief. The brief differs per signal and
 * per workflow stage, so the resulting emails genuinely differ instead of being one
 * template with the reason swapped in.
 */
async function draftEmail(input: DraftInput): Promise<{ subject: string; body: string }> {
  const fallbackBody =
    `Dear Customer,\n\n` +
    `We attempted to charge your card${input.amount ? ` ${input.amount}` : ""} for your subscription renewal and ${input.brief.purpose}.` +
    (input.secondAttempt
      ? " This follows an automatic second attempt we made on your behalf, which also did not succeed."
      : "") +
    `\n\n${input.brief.instruction}` +
    (input.brief.includeLink ? ` You can do this securely here: ${PAYMENT_LINK}` : "") +
    `\n\n` +
    (input.retryDescription
      ? `We will attempt the charge again automatically ${input.retryDescription}, and your access remains active in the meantime.\n\n`
      : `Your access remains active in the meantime.\n\n`) +
    `If anything here is unclear, simply reply to this email with your question and our team will get back to you with the next steps.\n\nWarm regards,\nRazorpay Team`;

  const content = await callLlm([
    {
      role: "system",
      content:
        "You write formal, courteous plain-text payment-recovery emails for an Indian SaaS business on Razorpay. " +
        'Reply ONLY with JSON: {"subject":string,"body":string}. ' +
        'The body opens with "Dear Customer," and has three or four short paragraphs separated by blank lines: ' +
        "(1) what happened with the charge, (2) the single specific instruction you are given, verbatim in meaning and " +
        "including the secure link only if a link is provided, (3) the automatic retry, only if told there is one, and " +
        "(4) a closing paragraph inviting them to reply to this email with any question so our team can help. " +
        "Follow the given purpose and instruction exactly — do not invent other steps, do not suggest updating the card " +
        "when the instruction is about something else, and do not ask the customer to act when the instruction says no " +
        'action is needed. No markdown, no bullet characters, no placeholders like [Name]. Sign off with "Warm regards," ' +
        'on its own line followed by "Razorpay Team".',
    },
    {
      role: "user",
      content: JSON.stringify({
        failure_signal: input.signal,
        what_happened: input.brief.purpose,
        single_instruction: input.brief.instruction,
        secure_link: input.brief.includeLink ? PAYMENT_LINK : null,
        amount: input.amount,
        razorpay_error_description: input.errorDescription,
        automatic_retry: input.retryDescription,
        is_second_attempt_after_automatic_retry: Boolean(input.secondAttempt),
        subject_should_convey: input.subjectHint,
      }),
    },
  ]);

  if (content) {
    try {
      const parsed = JSON.parse(content) as { subject?: string; body?: string };
      if (parsed.subject && parsed.body) return { subject: parsed.subject, body: parsed.body };
    } catch {
      /* fall through to template */
    }
  }
  return { subject: input.subjectHint, body: fallbackBody };
}

function amountSuffix(amount: string | null): string {
  return amount ? ` of ${amount}` : "";
}

async function draftForPlan(input: {
  plan: RecoveryPlan;
  signal: string;
  amount: string | null;
  errorDescription: string | null;
}): Promise<{ subject: string; body: string } | null> {
  const { plan, signal, amount, errorDescription } = input;
  if (!plan.wantsEmail || !plan.workflow) return null;

  if (plan.workflow === "C") {
    // Heads-up only: no action asked for yet, the reminder is a separate email in 2 days.
    return draftEmail({
      brief: HEADS_UP_BRIEF,
      signal,
      amount,
      errorDescription,
      retryDescription: "in 2 days",
      subjectHint: `Heads up: your renewal${amountSuffix(amount)} needs a little more balance`,
    });
  }

  if (plan.workflow === "B") {
    // Immediate notice; the automatic retry is already scheduled for +30 minutes.
    return draftEmail({
      brief: BANK_NOTICE_BRIEF,
      signal,
      amount,
      errorDescription,
      retryDescription: plan.retryDelayMinutes ? describeDelay(plan.retryDelayMinutes) : null,
      subjectHint: `Your payment${amountSuffix(amount)} did not go through — we will retry it shortly`,
    });
  }

  return draftEmail({
    brief: briefForSignal(signal),
    signal,
    amount,
    errorDescription,
    retryDescription: plan.retryDelayMinutes ? describeDelay(plan.retryDelayMinutes) : null,
    subjectHint: `Action needed: your payment${amountSuffix(amount)} could not be completed`,
  });
}

// ---------------------------------------------------------------- execution

async function deliverEmail(input: {
  to: string | null;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; note: string }> {
  if (!input.to) {
    return { sent: false, note: "No customer email address in the Razorpay payload." };
  }
  const config = readSmtpConfig();
  if (!config) {
    return { sent: false, note: "SMTP is not configured — email drafted only." };
  }
  try {
    const result = await sendMailViaSmtp({
      config,
      to: input.to,
      subject: input.subject,
      body: input.body,
    });
    return {
      sent: true,
      note: `Delivered over SMTP to ${input.to}.${
        result.queueId ? ` Mail server reference: ${result.queueId}` : ""
      }`,
    };
  } catch (error) {
    console.error("SMTP delivery failed", error);
    return {
      sent: false,
      note: `SMTP delivery failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

const DAY_MS = 24 * 60 * 60_000;

/** Maps agent_action rows to the customer email on their originating event. */
async function emailsForActions(
  db: Admin,
  rows: Array<{ event_id: string }>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set(rows.map((r) => r.event_id))];
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const { data } = await db.from("events").select(EVENT_COLUMNS).in("id", ids);
  for (const row of (data ?? []) as RiskEvent[]) {
    out.set(row.id, customerEmailFromPayload(row.payload));
  }
  return out;
}

/**
 * Money-recovered attribution. A successful payment closes the loop on a prior
 * recovery action for the same customer, so we can measure that the action worked.
 */
export async function attributeRecovery(
  db: Admin,
  event: RiskEvent,
  amountPaise: number | null,
): Promise<boolean> {
  const email = customerEmailFromPayload(event.payload);
  if (!email) return false;

  const since = new Date(new Date(event.received_at).getTime() - 7 * DAY_MS).toISOString();
  const { data } = await db
    .from("agent_actions")
    .select("id, event_id, created_at")
    .eq("recovered", false)
    .in("status", ["sent", "pending"])
    .in("category", ["customer_fixable", "bank_side"])
    .gte("created_at", since)
    .lte("created_at", event.received_at)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const emails = await emailsForActions(db, rows);
  const match = rows.find((row) => emails.get(row.event_id) === email);
  if (!match) return false;

  await db
    .from("agent_actions")
    .update({
      recovered: true,
      recovered_at: new Date().toISOString(),
      recovered_amount: amountPaise ?? null,
    })
    .eq("id", match.id);
  return true;
}

async function raiseFraudAlert(db: Admin, event: RiskEvent, signal: string, reasoning: string) {

  const { data: existing } = await db
    .from("business_alerts")
    .select("id")
    .eq("event_id", event.id)
    .eq("alert_type", "fraud_spike")
    .maybeSingle();
  if (existing) return;
  await db.from("business_alerts").insert({
    alert_type: "fraud_spike",
    summary: `Razorpay risk check blocked a payment (${signal}). ${reasoning}`,
    affected_count: 1,
    time_window_start: event.received_at,
    time_window_end: event.received_at,
    status: "open",
    event_id: event.id,
  });
}

/**
 * Classifies and acts on every event that has no agent_actions row yet.
 * Idempotent: the unique index on agent_actions.event_id guarantees one action per event.
 */
export async function runRecoveryPipeline(): Promise<{ processed: number; skipped: number }> {
  const db = await admin();

  const [{ data: events, error: eventsError }, { data: rules, error: rulesError }] =
    await Promise.all([
      db
        .from("events")
        .select(EVENT_COLUMNS)
        .order("received_at", { ascending: false })
        .limit(100),
      db.from("risk_rules").select("id, signal, root_cause, category, recommended_action, urgency"),
    ]);
  if (eventsError) throw new Error(eventsError.message);
  if (rulesError) throw new Error(rulesError.message);

  const { data: handled } = await db.from("agent_actions").select("event_id");
  const done = new Set((handled ?? []).map((row) => row.event_id));
  const ruleList = (rules ?? []) as RiskRule[];

  let processed = 0;
  let skipped = 0;

  for (const raw of (events ?? []) as RiskEvent[]) {
    if (done.has(raw.id)) {
      skipped += 1;
      continue;
    }
    try {
      await processEvent(db, raw, ruleList);
      processed += 1;
    } catch (error) {
      console.error("pipeline failed for event", raw.event_id, error);
    }
  }

  return { processed, skipped };
}

async function processEvent(db: Admin, event: RiskEvent, rules: RiskRule[]) {
  const { rule, signal } = matchRule(event.event_type, event.payload, rules);
  const summary = summarizeEvent(event.payload);
  const amount = formatAmount(summary.amount, summary.currency);
  const recipient = customerEmailFromPayload(event.payload);
  const resolvedSignal = signal ?? event.event_type;

  // A successful payment closes the loop on a recent recovery action for the same customer.
  if (HEALTHY_EVENT_TYPES.includes(event.event_type)) {
    try {
      await attributeRecovery(db, event, summary.amount);
    } catch (error) {
      console.error("recovery attribution failed", event.event_id, error);
    }
  }


  let matchedVia: "knowledge_base" | "llm_fallback" = "knowledge_base";
  let plan: RecoveryPlan;

  if (rule) {
    plan = resolveWorkflow(resolvedSignal, rule);
  } else {
    matchedVia = "llm_fallback";
    const verdict = await pickWorkflowWithLlm({
      signal: resolvedSignal,
      eventType: event.event_type,
      errorDescription: summary.errorDescription,
      amount,
    });
    plan = verdict
      ? planFromWorkflowId(verdict.workflow, verdict.plain_english_explanation)
      : {
          workflow: "A",
          decision: "email_drafted",
          category: "merchant_side",
          channel: "email",
          reasoning:
            "No knowledge-base rule matched and the AI fallback was unavailable. A safe generic failure email is sent immediately and the event remains visible for review.",
          retryDelayMinutes: null,
          wantsEmail: true,
          status: "flagged_for_review",
        };
  }

  // Workflow D: fraud is held for review and never retried, but still receives the
  // required neutral immediate failure notice.
  if (plan.workflow === "D" || plan.category === "fraud_suspected" || isFraudSignal(resolvedSignal, rule)) {
    const fraudPlan: RecoveryPlan =
      plan.workflow === "D"
        ? plan
        : { ...plan, workflow: "D", wantsEmail: true, retryDelayMinutes: null };
    await raiseFraudAlert(db, event, resolvedSignal, fraudPlan.reasoning);
    const email = await draftForPlan({
      plan: fraudPlan,
      signal: resolvedSignal,
      amount,
      errorDescription: summary.errorDescription,
    });
    const delivery = email
      ? await deliverEmail({ to: recipient, subject: email.subject, body: email.body })
      : { sent: false, note: "The immediate email could not be drafted." };
    await insertAction(db, {
      event,
      signal: resolvedSignal,
      matchedVia,
      plan: fraudPlan,
      email,
      note: `${delivery.note} Routed to the Review Desk with no automatic retry.`,
      sent: delivery.sent,
      scheduledFor: null,
    });
    return;
  }

  // Workflows B and C schedule a retry; A and healthy never do.
  let scheduledFor: string | null = null;
  if (plan.retryDelayMinutes !== null) {
    scheduledFor = new Date(Date.now() + plan.retryDelayMinutes * 60_000).toISOString();
    await db.from("scheduled_retries").insert({ event_id: event.id, retry_at: scheduledFor });
  }

  const email = await draftForPlan({
    plan,
    signal: resolvedSignal,
    amount,
    errorDescription: summary.errorDescription,
  });

  let sent = false;
  let note = "";
  if (email) {
    const result = await deliverEmail({
      to: recipient,
      subject: email.subject,
      body: email.body,
    });

    sent = result.sent;
    note = result.note;
  }

  await insertAction(db, {
    event,
    signal: resolvedSignal,
    matchedVia,
    plan,
    email,
    note,
    sent,
    scheduledFor,
  });
}

async function insertAction(
  db: Admin,
  input: {
    event: RiskEvent;
    signal: string;
    matchedVia: "knowledge_base" | "llm_fallback";
    plan: RecoveryPlan;
    email: { subject: string; body: string } | null;
    note: string;
    sent: boolean;
    scheduledFor: string | null;
  },
) {
  const decision =
    input.email && input.sent
      ? input.plan.decision === "retry_and_email"
        ? "retry_and_email"
        : "email_sent"
      : input.plan.decision;

  await db.from("agent_actions").upsert(
    {
      event_id: input.event.id,
      signal: input.signal,
      matched_via: input.matchedVia,
      decision,
      reasoning: [input.plan.reasoning, input.note].filter(Boolean).join(" "),
      category: input.plan.category,
      channel: input.plan.channel,
      workflow: input.plan.workflow,
      email_subject: input.email?.subject ?? null,
      email_body: input.email?.body ?? null,
      scheduled_for: input.scheduledFor,
      status: input.sent ? "sent" : input.plan.status,
      sent_at: input.sent ? new Date().toISOString() : null,
    },
    { onConflict: "event_id", ignoreDuplicates: true },
  );
}

// ---------------------------------------------------------------- retries

/**
 * Did a successful payment arrive for this customer after the retry was scheduled?
 * That is how we decide whether a workflow-B retry recovered or needs escalating.
 */
async function recoveredAfter(
  db: Admin,
  since: string,
  customerEmail: string | null,
): Promise<boolean> {
  const { data } = await db
    .from("events")
    .select(EVENT_COLUMNS)
    .in("event_type", HEALTHY_EVENT_TYPES)
    .gte("received_at", since)
    .limit(50);
  for (const row of (data ?? []) as RiskEvent[]) {
    if (!customerEmail) return true;
    if (customerEmailFromPayload(row.payload) === customerEmail) return true;
  }
  return false;
}

export async function executeDueRetries(): Promise<{ executed: number; escalated: number }> {
  const db = await admin();
  const { data: due, error } = await db
    .from("scheduled_retries")
    .select("id, event_id, retry_at, executed, created_at")
    .eq("executed", false)
    .lte("retry_at", new Date().toISOString())
    .limit(50);
  if (error) throw new Error(error.message);

  let executed = 0;
  let escalated = 0;

  for (const retry of due ?? []) {
    const { data: eventRow } = await db
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("id", retry.event_id)
      .maybeSingle();
    const event = (eventRow ?? null) as RiskEvent | null;

    const { data: actionRow } = await db
      .from("agent_actions")
      .select("id, workflow, signal, escalated_at")
      .eq("event_id", retry.event_id)
      .maybeSingle();

    const summary = event ? summarizeEvent(event.payload) : null;
    const amount = summary ? formatAmount(summary.amount, summary.currency) : null;
    const recipient = event ? customerEmailFromPayload(event.payload) : null;
    const workflow = (actionRow?.workflow ?? null) as WorkflowId | null;
    const signal = actionRow?.signal ?? event?.event_type ?? "unknown";
    const ranAt = new Date().toISOString();

    const recovered = await recoveredAfter(db, retry.created_at ?? retry.retry_at, recipient);

    let decision = "retry_executed";
    let status: string = "sent";
    let note = "Charge re-attempt handed back to Razorpay; the outcome arrives as a new webhook event.";
    let outcome = "executed";
    let escalatedAt: string | null = null;
    let email: { subject: string; body: string } | null = null;

    if (recovered) {
      decision = "retry_recovered";
      outcome = "recovered";
      note = "A successful payment arrived for this customer after the retry, so no email was needed.";
    } else if (workflow === "B") {
      // Workflow B escalation: the automatic retry did not recover the payment, so we write again.
      email = await draftEmail({
        brief: ESCALATION_BRIEF,
        signal,
        amount,
        errorDescription: summary?.errorDescription ?? null,
        retryDescription: null,
        secondAttempt: true,
        subjectHint: `Second attempt failed — payment link for your renewal${amount ? ` of ${amount}` : ""}`,
      });
      decision = "retry_failed_email_sent";
      outcome = "failed_escalated";
      escalatedAt = ranAt;
    } else if (workflow === "C") {
      // Workflow C reminder: the payday nudge with the payment link.
      email = await draftEmail({
        brief: NUDGE_BRIEF,
        signal,
        amount,
        errorDescription: summary?.errorDescription ?? null,
        retryDescription: null,
        subjectHint: `Reminder: your renewal${amount ? ` of ${amount}` : ""} is ready to complete`,
      });
      decision = "retry_executed";
      outcome = "reminder_sent";
    }

    if (email) {
      const result = await deliverEmail({

        to: recipient,
        subject: email.subject,
        body: email.body,
      });
      status = result.sent ? "sent" : "pending";
      note = `${result.note}`;
      if (result.sent) escalatedAt = escalatedAt ?? null;
      escalated += 1;
    }

    await db
      .from("agent_actions")
      .update({
        decision,
        status,
        escalated_at: escalatedAt ?? actionRow?.escalated_at ?? null,
        reasoning: `Scheduled retry ran at ${ranAt}${amount ? ` for ${amount}` : ""}. ${note}`,
        ...(email ? { email_subject: email.subject, email_body: email.body } : {}),
        ...(email && status === "sent" ? { sent_at: ranAt } : {}),
      })
      .eq("event_id", retry.event_id);

    await db
      .from("scheduled_retries")
      .update({ executed: true, outcome })
      .eq("id", retry.id);
    executed += 1;
  }
  return { executed, escalated };
}

/** Demo helper: pulls every pending retry forward to now and runs them. */
export async function fastForwardRetries(eventId?: string): Promise<{
  moved: number;
  executed: number;
  escalated: number;
}> {
  const db = await admin();
  const now = new Date().toISOString();
  let query = db.from("scheduled_retries").update({ retry_at: now }).eq("executed", false);
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  const result = await executeDueRetries();
  return { moved: (data ?? []).length, ...result };
}

// ---------------------------------------------------------------- monitor

export async function runBackgroundMonitor(): Promise<{ alerts: number }> {
  const db = await admin();
  const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
  const windowEnd = new Date().toISOString();

  const [{ data: events, error }, { data: rules }] = await Promise.all([
    db
      .from("events")
      .select(EVENT_COLUMNS)
      .gte("received_at", windowStart)
      .order("received_at", { ascending: false })
      .limit(500),
    db.from("risk_rules").select("id, signal, root_cause, category, recommended_action, urgency"),
  ]);
  if (error) throw new Error(error.message);
  const ruleList = (rules ?? []) as RiskRule[];

  const bySignal = new Map<string, { count: number; bank: string | null; healthy: boolean }>();
  let unclassified = 0;
  let alerts = 0;

  for (const raw of (events ?? []) as RiskEvent[]) {
    const { rule, signal } = matchRule(raw.event_type, raw.payload, ruleList);
    const key = (signal ?? raw.event_type).toLowerCase();

    if (isFraudSignal(key, rule)) {
      await raiseFraudAlert(db, raw, key, "Detected by the background monitor.");
      alerts += 1;
      continue;
    }
    if (!rule) unclassified += 1;

    const bank = bankFromPayload(raw.payload);
    const bucket = bySignal.get(key) ?? {
      count: 0,
      bank,
      healthy: rule?.category === "healthy",
    };
    bucket.count += 1;
    if (bank && bucket.bank && bucket.bank !== bank) bucket.bank = null;
    bySignal.set(key, bucket);
  }

  for (const [signal, bucket] of bySignal) {
    if (bucket.healthy || bucket.count < 5) continue;
    const created = await insertWindowAlert(db, {
      alertType: "bank_outage_suspected",
      summary: `${bucket.count} payments failed with ${signal}${
        bucket.bank ? ` on ${bucket.bank}` : ""
      } in the last hour — possible bank-side issue.`,
      count: bucket.count,
      windowStart,
      windowEnd,
    });
    if (created) alerts += 1;
  }

  if (unclassified >= 5) {
    const created = await insertWindowAlert(db, {
      alertType: "unclassified_spike",
      summary: `${unclassified} events in the last hour matched no rule in the knowledge base — the failure mix may have changed.`,
      count: unclassified,
      windowStart,
      windowEnd,
    });
    if (created) alerts += 1;
  }

  return { alerts };
}

function bankFromPayload(payload: unknown): string | null {
  const root = payload as Record<string, unknown> | null;
  const inner = root?.["payload"] as Record<string, unknown> | undefined;
  const payment = (inner?.["payment"] as Record<string, unknown> | undefined)?.["entity"] as
    | Record<string, unknown>
    | undefined;
  const card = payment?.["card"] as Record<string, unknown> | undefined;
  const candidate = payment?.["bank"] ?? card?.["issuer"] ?? card?.["network"];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/** One open alert per type per rolling hour, so the monitor can run often without spamming. */
async function insertWindowAlert(
  db: Admin,
  input: {
    alertType: string;
    summary: string;
    count: number;
    windowStart: string;
    windowEnd: string;
  },
): Promise<boolean> {
  const { data: recent } = await db
    .from("business_alerts")
    .select("id")
    .eq("alert_type", input.alertType)
    .eq("status", "open")
    .gte("created_at", input.windowStart)
    .limit(1);
  if (recent && recent.length > 0) return false;

  await db.from("business_alerts").insert({
    alert_type: input.alertType,
    summary: input.summary,
    affected_count: input.count,
    time_window_start: input.windowStart,
    time_window_end: input.windowEnd,
    status: "open",
  });
  return true;
}
