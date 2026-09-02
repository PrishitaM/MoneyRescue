/**
 * Server-only email follow-up agent.
 *
 * The recovery email invites the customer to reply with a question. This module
 * polls the Gmail inbox (through the Lovable connector gateway), answers the
 * first reply with an AI-written solution grounded in the knowledge base, and
 * accepts exactly one YES/NO confirmation before closing or escalating.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { customerEmailFromPayload } from "./agent";
import { readConfirmation, type SupportThread } from "./support";
import type { RiskRule } from "./risk";

type Admin = SupabaseClient<Database>;

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

function gmailHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("Gmail connector is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function gmail<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: init?.method ?? "GET",
    headers: { ...gmailHeaders(), ...(init?.body ? { "content-type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`Gmail request failed [${res.status}] ${path}: ${detail}`);
  }
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ MIME utils

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
};

function header(message: GmailMessage, name: string): string | null {
  const found = message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? null;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function plainTextBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = plainTextBody(child);
    if (found) return found;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

/** Drops quoted history so the model only sees what the customer just wrote. */
function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*Original Message/i.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n").trim().slice(0, 4000);
}

function addressOf(raw: string | null): string | null {
  if (!raw) return null;
  const match = /<([^>]+)>/.exec(raw);
  const candidate = (match?.[1] ?? raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(candidate) ? candidate : null;
}

function encodeSubject(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

async function sendReply(input: {
  to: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyTo: string | null;
  references: string | null;
}): Promise<void> {
  const subject = input.subject.toLowerCase().startsWith("re:")
    ? input.subject
    : `Re: ${input.subject}`;
  const headers = [
    `To: ${input.to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  const references = [input.references, input.inReplyTo].filter(Boolean).join(" ");
  if (references) headers.push(`References: ${references}`);

  const raw = `${headers.join("\r\n")}\r\n\r\n${input.body.replace(/\r?\n/g, "\r\n")}`;
  const encoded = Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail("/users/me/messages/send", {
    method: "POST",
    body: { raw: encoded, threadId: input.threadId },
  });
}

async function markRead(messageId: string): Promise<void> {
  await gmail(`/users/me/messages/${messageId}/modify`, {
    method: "POST",
    body: { removeLabelIds: ["UNREAD"] },
  });
}

// ------------------------------------------------------------------ AI replies

const SIGNATURE = "Warm regards,\nRazorpay Team";

export type ThreadMessage = {
  sender: "customer" | "agent";
  body: string;
  created_at: string;
};

const CONFIRM_QUESTION = "Does this resolve your issue? Please reply YES or NO.";

async function aiSolution(input: {
  question: string;
  history: ThreadMessage[];
  originalEmail: string | null;
  rule: RiskRule | null;
  signal: string | null;
  askConfirmation: boolean;
}): Promise<string> {
  const { callLlm } = await import("./agent.server");
  const closing = input.askConfirmation
    ? "(3) a closing paragraph that answers any remaining doubt and then ends with this exact sentence on its own line: " +
      `"${CONFIRM_QUESTION}"`
    : "(3) a closing paragraph offering to help further and inviting them to reply with any remaining questions. " +
      "Do NOT ask them to reply YES or NO, and do not ask whether the issue is resolved — it is too early for that.";

  const content = await callLlm([
    {
      role: "system",
      content:
        "You are a payment support specialist writing on behalf of the Razorpay Team to a customer whose " +
        'recurring card payment failed. Reply ONLY with JSON: {"body":string}. ' +
        "You are given the full conversation history so far; use all of it, not just the latest message, and do not " +
        "repeat advice you already gave verbatim. " +
        "The body is a formal plain-text email of 3 short paragraphs separated by blank lines: " +
        "(1) a greeting and acknowledgement of what they just wrote, (2) a clear, specific solution grounded in the " +
        "diagnosis provided, with concrete steps and a link written as https://pay.example.com/update-card when a " +
        "payment method change is needed, " +
        closing +
        ". " +
        'No markdown, no bullet characters, no placeholders like [Name]. End with "Warm regards," on its own ' +
        'line followed by "Razorpay Team" on the next line.',
    },
    {
      role: "user",
      content: JSON.stringify({
        latest_customer_message: input.question,
        conversation_history: input.history.map((m) => ({
          from: m.sender,
          at: m.created_at,
          text: m.body.slice(0, 1500),
        })),
        original_recovery_email: input.originalEmail,
        failure_signal: input.signal,
        diagnosed_root_cause: input.rule?.root_cause ?? null,
        recommended_action: input.rule?.recommended_action ?? null,
      }),
    },
  ]);

  if (content) {
    try {
      const parsed = JSON.parse(content) as { body?: string };
      if (parsed.body && parsed.body.trim().length > 40) {
        let body = parsed.body.trim();
        if (input.askConfirmation && !/reply\s+YES/i.test(body)) {
          body = body.replace(/\n*Warm regards,/, `\n\n${CONFIRM_QUESTION}\n\nWarm regards,`);
        }
        return body;
      }
    } catch {
      /* fall through */
    }
  }

  return (
    "Dear Customer,\n\n" +
    "Thank you for writing back about your recent subscription payment. We have reviewed your account and the " +
    "failure recorded against it.\n\n" +
    `${
      input.rule
        ? `${input.rule.root_cause} ${input.rule.recommended_action}`
        : "The charge was declined before it reached us. Please retry the payment with an active card, or update your saved payment method using this secure link: https://pay.example.com/update-card"
    }\n\n` +
    (input.askConfirmation
      ? `${CONFIRM_QUESTION}\n\n`
      : "If anything above is unclear, simply reply to this email and we will guide you through it.\n\n") +
    SIGNATURE
  );
}

/** Uses the model to read a free-form reply as a YES or NO to the closing question. */
async function aiIntent(text: string, history: ThreadMessage[]): Promise<"yes" | "no"> {
  const heuristic = readConfirmation(text);
  try {
    const { callLlm } = await import("./agent.server");
    const content = await callLlm([
      {
        role: "system",
        content:
          "A support agent asked the customer: 'Does this resolve your issue? Please reply YES or NO.' " +
          'Read the customer\'s reply and decide their intent. Reply ONLY with JSON: {"verdict":"yes"|"no"}. ' +
          '"yes" means the issue is resolved and the thread can close. "no" means it is unresolved, they are ' +
          "unhappy, still confused, or want a human. If you are unsure, answer \"no\".",
      },
      {
        role: "user",
        content: JSON.stringify({
          customer_reply: text,
          conversation_history: history.map((m) => ({ from: m.sender, text: m.body.slice(0, 800) })),
        }),
      },
    ]);
    if (content) {
      const parsed = JSON.parse(content) as { verdict?: string };
      if (parsed.verdict === "yes") return "yes";
      if (parsed.verdict === "no") return "no";
    }
  } catch (error) {
    console.error("intent classification failed", error);
  }
  return heuristic === "yes" ? "yes" : "no";
}



const SATISFIED_REPLY =
  "Dear Customer,\n\n" +
  "Thank you for confirming that the issue is resolved. Your subscription is active and no further action is " +
  "needed from your side.\n\n" +
  "We have closed this request. If anything else comes up with a payment, simply reply to this email and we will " +
  "pick it up right away.\n\n" +
  SIGNATURE;

const ESCALATED_REPLY =
  "Dear Customer,\n\n" +
  "Thank you for letting us know that the issue is still unresolved. We have escalated your request to a support " +
  "executive on our payments team.\n\n" +
  "They will reach out to you shortly over text or a call using the contact details on your account, and they will " +
  "already have the full history of this conversation, so you will not need to repeat anything.\n\n" +
  "We appreciate your patience while we sort this out for you.\n\n" +
  SIGNATURE;

// ------------------------------------------------------------------ pipeline

type ActionContext = {
  eventId: string | null;
  signal: string | null;
  emailBody: string | null;
  matchedVia: string | null;
};

async function contextForSender(db: Admin, sender: string): Promise<ActionContext | null> {
  const { data } = await db
    .from("agent_actions")
    .select("event_id, signal, email_body, matched_via, created_at, events(payload)")
    .order("created_at", { ascending: false })
    .limit(60);

  for (const row of (data ?? []) as Array<{
    event_id: string;
    signal: string;
    email_body: string | null;
    matched_via: string;
    events: { payload: unknown } | null;
  }>) {
    const recipient = row.events ? customerEmailFromPayload(row.events.payload as never) : null;
    if (recipient && recipient.toLowerCase() === sender) {
      return {
        eventId: row.event_id,
        signal: row.signal,
        emailBody: row.email_body,
        matchedVia: row.matched_via,
      };
    }
  }
  return null;
}

/**
 * Polls unread inbox mail and advances each customer conversation by one step.
 * Only one AI answer and one YES/NO confirmation are ever accepted per thread.
 */
export async function processSupportInbox(): Promise<{
  scanned: number;
  answered: number;
  closed: number;
  escalated: number;
}> {
  const db = await admin();
  const result = { scanned: 0, answered: 0, closed: 0, escalated: 0 };

  const list = await gmail<{ messages?: Array<{ id: string; threadId: string }> }>(
    "/users/me/messages?q=" + encodeURIComponent("is:unread in:inbox -in:chats") + "&maxResults=20",
  );
  const messages = list.messages ?? [];
  if (messages.length === 0) return result;

  const { data: rules } = await db
    .from("risk_rules")
    .select("id, signal, root_cause, category, recommended_action, urgency");
  const ruleList = (rules ?? []) as RiskRule[];

  for (const ref of messages) {
    let full: GmailMessage;
    try {
      full = await gmail<GmailMessage>(`/users/me/messages/${ref.id}?format=full`);
    } catch (error) {
      console.error("failed to read message", ref.id, error);
      continue;
    }
    result.scanned += 1;

    const sender = addressOf(header(full, "From"));
    const subject = header(full, "Subject") ?? "Your subscription payment";
    const messageId = header(full, "Message-ID");
    const references = header(full, "References");
    const text = stripQuotedReply(plainTextBody(full.payload));

    if (!sender) {
      await markRead(full.id).catch(() => undefined);
      continue;
    }

    const { data: existing } = await db
      .from("support_threads")
      .select("*")
      .eq("gmail_thread_id", full.threadId)
      .maybeSingle();
    let thread = existing as SupportThread | null;

    let context: ActionContext | null = null;
    if (!thread) {
      context = await contextForSender(db, sender);
      if (!context) {
        // Not a reply to one of our recovery emails — leave it alone.
        continue;
      }
      const { data: created, error } = await db
        .from("support_threads")
        .insert({
          event_id: context.eventId,
          customer_email: sender,
          original_subject: subject,
          gmail_thread_id: full.threadId,
          state: "awaiting_question",
          matched_via: context.matchedVia,
        })
        .select("*")
        .single();
      if (error) {
        console.error("failed to open support thread", error.message);
        continue;
      }
      thread = created as SupportThread;

      // Seed the conversation with the recovery email we originally sent.
      if (context.emailBody) {
        await db.from("support_messages").insert({
          thread_id: thread.id,
          event_id: context.eventId,
          sender: "agent",
          subject,
          body: context.emailBody,
        });
      }
    }

    try {
      if (!context && thread.event_id) {
        const { data: action } = await db
          .from("agent_actions")
          .select("event_id, signal, email_body, matched_via")
          .eq("event_id", thread.event_id)
          .maybeSingle();
        if (action) {
          context = {
            eventId: action.event_id,
            signal: action.signal,
            emailBody: action.email_body,
            matchedVia: action.matched_via,
          };
        }
      }
      const rule =
        ruleList.find((r) => r.signal.toLowerCase() === (context?.signal ?? "").toLowerCase()) ??
        null;

      const { data: priorRows } = await db
        .from("support_messages")
        .select("sender, body, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });
      const history = (priorRows ?? []) as ThreadMessage[];

      const customerText = text || "The customer replied without any readable text.";
      await db.from("support_messages").insert({
        thread_id: thread.id,
        event_id: thread.event_id,
        sender: "customer",
        subject,
        body: customerText,
        gmail_message_id: full.id,
      });
      const customerReplies = history.filter((m) => m.sender === "customer").length + 1;

      if (thread.human_owned) {
        // A support executive owns this thread — record the reply, never auto-answer.
        await db
          .from("support_threads")
          .update({ customer_question: customerText })
          .eq("id", thread.id);
        await markRead(full.id).catch(() => undefined);
        continue;
      }

      const plainVerdict = readConfirmation(customerText);
      const looksLikeQuestion =
        customerText.includes("?") || customerText.trim().split(/\s+/).length > 12;
      const answersConfirmation =
        thread.state === "awaiting_confirmation" ||
        customerReplies >= 3 ||
        (customerReplies === 1 && plainVerdict !== "unclear" && !looksLikeQuestion);

      if (answersConfirmation) {
        const verdict =
          customerReplies === 1 && plainVerdict !== "unclear"
            ? plainVerdict
            : await aiIntent(customerText, [...history, {
                sender: "customer",
                body: customerText,
                created_at: new Date().toISOString(),
              }]);
        const satisfied = verdict === "yes";
        const body = satisfied ? SATISFIED_REPLY : ESCALATED_REPLY;

        await sendReply({
          to: sender,
          subject,
          body,
          threadId: full.threadId,
          inReplyTo: messageId,
          references,
        });
        await db.from("support_messages").insert({
          thread_id: thread.id,
          event_id: thread.event_id,
          sender: "agent",
          subject,
          body,
        });
        await db
          .from("support_threads")
          .update({
            state: satisfied ? "closed_satisfied" : "escalated",
            customer_confirmation: customerText,
            final_reply: body,
          })
          .eq("id", thread.id);

        if (satisfied) {
          result.closed += 1;
          if (context?.eventId) {
            await db
              .from("agent_actions")
              .update({ status: "resolved" })
              .eq("event_id", context.eventId);
          }
        } else {
          result.escalated += 1;
          const transcript = [
            ...history,
            { sender: "customer" as const, body: customerText, created_at: "" },
          ]
            .map((m) => `${m.sender === "customer" ? "Customer" : "Agent"}: ${m.body.slice(0, 400)}`)
            .join("\n---\n");
          await db.from("business_alerts").insert({
            alert_type: "support_escalation",
            summary:
              `${sender} is still unresolved after ${customerReplies} replies — a support executive must call or text them.\n\n` +
              `Full conversation so far:\n${transcript.slice(0, 3000)}`,
            affected_count: 1,
            status: "open",
            event_id: thread.event_id,
          });
        }
      } else if (thread.state === "awaiting_question") {
        const askConfirmation = customerReplies >= 2;
        const answer = await aiSolution({
          question: customerText,
          history,
          originalEmail: context?.emailBody ?? null,
          rule,
          signal: context?.signal ?? null,
          askConfirmation,
        });

        await sendReply({
          to: sender,
          subject,
          body: answer,
          threadId: full.threadId,
          inReplyTo: messageId,
          references,
        });
        await db.from("support_messages").insert({
          thread_id: thread.id,
          event_id: thread.event_id,
          sender: "agent",
          subject,
          body: answer,
        });
        await db
          .from("support_threads")
          .update({
            state: askConfirmation ? "awaiting_confirmation" : "awaiting_question",
            customer_question: customerText,
            ai_answer: answer,
          })
          .eq("id", thread.id);
        result.answered += 1;
      }

      // closed_satisfied / escalated: conversation is over, nothing more is sent.
    } catch (error) {
      console.error("support thread step failed", thread.id, error);
    }

    await markRead(full.id).catch(() => undefined);
  }

  return result;
}

// ------------------------------------------------------- human agent takeover

/** Latest RFC Message-ID / References headers on a Gmail thread, for threading. */
async function threadHeaders(
  gmailThreadId: string,
): Promise<{ inReplyTo: string | null; references: string | null; subject: string | null }> {
  try {
    const thread = await gmail<{ messages?: GmailMessage[] }>(
      `/users/me/threads/${gmailThreadId}?format=metadata`,
    );
    const messages = thread.messages ?? [];
    const last = messages[messages.length - 1];
    if (!last) return { inReplyTo: null, references: null, subject: null };
    return {
      inReplyTo: header(last, "Message-ID"),
      references: header(last, "References"),
      subject: header(last, "Subject"),
    };
  } catch (error) {
    console.error("failed to read gmail thread headers", gmailThreadId, error);
    return { inReplyTo: null, references: null, subject: null };
  }
}

/** Sends a support executive's typed reply and hands the thread to the human. */
export async function sendHumanReply(input: {
  threadId: string;
  body: string;
}): Promise<{ ok: true }> {
  const db = await admin();
  const { data, error } = await db
    .from("support_threads")
    .select("*")
    .eq("id", input.threadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const thread = data as SupportThread | null;
  if (!thread) throw new Error("Thread not found");

  const message = input.body.trim();
  if (message.length < 2) throw new Error("Reply is empty");

  const headers = await threadHeaders(thread.gmail_thread_id);
  const subject = thread.original_subject ?? headers.subject ?? "Your subscription payment";

  await sendReply({
    to: thread.customer_email,
    subject,
    body: message,
    threadId: thread.gmail_thread_id,
    inReplyTo: headers.inReplyTo,
    references: headers.references,
  });

  await db.from("support_messages").insert({
    thread_id: thread.id,
    event_id: thread.event_id,
    sender: "human_agent",
    subject,
    body: message,
  });

  await db
    .from("support_threads")
    .update({
      human_owned: true,
      human_owned_at: new Date().toISOString(),
      state: thread.state === "closed_satisfied" ? "closed_satisfied" : "human_owned",
      final_reply: message,
    })
    .eq("id", thread.id);

  return { ok: true };
}

/** Manual close by a human support agent. */
export async function resolveThreadManually(threadId: string): Promise<{ ok: true }> {
  const db = await admin();
  const { data } = await db
    .from("support_threads")
    .select("id, event_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!data) throw new Error("Thread not found");

  await db
    .from("support_threads")
    .update({ state: "closed_by_human", human_owned: false })
    .eq("id", threadId);

  if (data.event_id) {
    await db.from("agent_actions").update({ status: "resolved" }).eq("event_id", data.event_id);
  }
  return { ok: true };
}
