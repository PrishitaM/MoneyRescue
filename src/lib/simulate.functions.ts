import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { findSimulatedFailure } from "./simulate";
import type { AgentAction } from "./agent";

const input = z.object({
  signal: z.string().min(1),
  email: z.string().email(),
  amount: z.number().positive().max(500000),
});

function randomId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 14; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${out}`;
}

/**
 * Injects a realistically shaped Razorpay webhook event for the chosen failure signal,
 * then runs the recovery agent immediately so the demo shows the decision + email at once.
 */
export const simulateFailureEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }) => {
    const failure = findSimulatedFailure(data.signal);
    if (!failure) throw new Error("Unknown failure signal");

    const nowSeconds = Math.floor(Date.now() / 1000);
    const paise = Math.round(data.amount * 100);
    const isFailure = failure.eventType === "payment.failed";

    const payment: Record<string, unknown> = {
      id: randomId("pay"),
      entity: "payment",
      amount: paise,
      currency: "INR",
      status: isFailure ? "failed" : failure.eventType === "payment.captured" ? "captured" : "authorized",
      order_id: randomId("order"),
      method: "card",
      captured: failure.eventType === "payment.captured",
      description: "Revenue Risk Radar Test — monthly subscription charge",
      email: data.email,
      contact: "+919876543210",
      card: {
        id: randomId("card"),
        last4: "1111",
        network: "Visa",
        type: "credit",
        issuer: "HDFC",
        international: failure.signal === "international_card_not_allowed",
      },
      acquirer_data: { auth_code: isFailure ? null : "123456" },
      created_at: nowSeconds,
      error_code: isFailure ? failure.errorCode : null,
      error_description: isFailure ? failure.description : null,
      error_source: isFailure ? failure.source : null,
      error_step: isFailure ? failure.step : null,
      error_reason: isFailure ? failure.signal : null,
      ...(isFailure
        ? {
            error: {
              code: failure.errorCode,
              description: failure.description,
              source: failure.source,
              step: failure.step,
              reason: failure.signal,
            },
          }
        : {}),
    };

    const eventId = randomId("evt");
    const envelope = {
      entity: "event",
      account_id: "acc_TESTRADAR001",
      event: failure.eventType,
      contains: ["payment"],
      payload: { payment: { entity: payment } },
      created_at: nowSeconds,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("events")
      .insert({
        event_id: eventId,
        event_type: failure.eventType,
        payload: envelope as never,
        event_created_at: new Date(nowSeconds * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Could not store the simulated event");

    const { runRecoveryPipeline } = await import("./agent.server");
    await runRecoveryPipeline();

    const { data: action } = await supabaseAdmin
      .from("agent_actions")
      .select(
        "id, event_id, signal, matched_via, decision, reasoning, category, channel, email_subject, email_body, scheduled_for, status, created_at, sent_at, workflow, escalated_at",
      )
      .eq("event_id", inserted.id)
      .maybeSingle();

    return {
      eventId,
      eventRowId: inserted.id as string,
      signal: failure.signal,
      action: (action ?? null) as AgentAction | null,
    };
  });
