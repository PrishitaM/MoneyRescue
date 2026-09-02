import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = Buffer.from(signature, "utf8");
  const digest = Buffer.from(expected, "utf8");
  if (received.length !== digest.length) return false;
  return timingSafeEqual(received, digest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const Route = createFileRoute("/api/public/webhook/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
        const rawBody = await request.text();

        if (!secret) {
          console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
          return json({ error: "Webhook not configured" }, 500);
        }

        const signature = request.headers.get("x-razorpay-signature") ?? "";
        if (!signature || !verifySignature(rawBody, signature, secret)) {
          return json({ error: "Invalid signature" }, 401);
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        if (!isRecord(parsed) || typeof parsed["event"] !== "string") {
          return json({ error: "Missing event" }, 400);
        }

        const eventType = parsed["event"];
        const inner = parsed["payload"];
        if (!isRecord(inner) || (!isRecord(inner["subscription"]) && !isRecord(inner["payment"]))) {
          return json({ error: "Payload must contain a subscription or payment object" }, 400);
        }

        // Razorpay uses at-least-once delivery: dedupe on its event id.
        const headerEventId = request.headers.get("x-razorpay-event-id");
        const entity =
          (isRecord(inner["payment"]) && isRecord(inner["payment"]["entity"])
            ? inner["payment"]["entity"]
            : null) ??
          (isRecord(inner["subscription"]) && isRecord(inner["subscription"]["entity"])
            ? inner["subscription"]["entity"]
            : null);
        const entityId =
          entity && typeof entity["id"] === "string" ? (entity["id"] as string) : "unknown";
        const eventId = headerEventId ?? `${eventType}:${entityId}`;

        const createdAtRaw = parsed["created_at"];
        const eventCreatedAt =
          typeof createdAtRaw === "number" && Number.isFinite(createdAtRaw)
            ? new Date(createdAtRaw * 1000).toISOString()
            : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("events")
          .upsert(
            {
              event_id: eventId,
              event_type: eventType,
              payload: parsed as never,
              event_created_at: eventCreatedAt,
            },
            { onConflict: "event_id", ignoreDuplicates: true },
          );

        if (error) {
          console.error("Failed to store webhook event", error.message);
          return json({ error: "Failed to store event" }, 500);
        }

        // Process immediately so the first AI-written failure email is not delayed until
        // the scheduled catch-up job. The pipeline is idempotent, so webhook replays and
        // the cron safely skip events that already have an action.
        try {
          const { runRecoveryPipeline } = await import("@/lib/agent.server");
          await runRecoveryPipeline();
        } catch (pipelineError) {
          // The event is already durable; cron will retry processing if the agent or
          // email provider is temporarily unavailable.
          console.error("Immediate recovery pipeline failed", pipelineError);
        }

        return json({ received: true }, 200);
      },
    },
  },
});
