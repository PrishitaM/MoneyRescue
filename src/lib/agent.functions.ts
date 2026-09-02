import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createPublicClient } from "./risk.server";
import type { AgentAction, BusinessAlert } from "./agent";

const ACTION_COLUMNS =
  "id, event_id, signal, matched_via, decision, reasoning, category, channel, email_subject, email_body, scheduled_for, status, created_at, sent_at, workflow, escalated_at, recovered, recovered_at, recovered_amount";
const ALERT_COLUMNS =
  "id, alert_type, summary, affected_count, time_window_start, time_window_end, status, created_at, event_id";

export type RecoveryAuditRow = {
  id: string;
  created_at: string;
  signal: string;
  workflow: string | null;
  decision: string;
  matched_via: string;
  status: string;
  category: string;
  recovered: boolean;
  recovered_at: string | null;
  escalated_at: string | null;
  amount_paise: number | null;
  recovered_amount: number | null;
  customer_email: string | null;
};

export type WorkflowBreakdownRow = {
  workflow: string;
  events: number;
  at_risk_paise: number;
  recovered_paise: number;
  recovered_count: number;
};

export type RecoverySummary = {
  period_start: string;
  generated_at: string;
  at_risk_paise: number;
  at_risk_events: number;
  recovered_paise: number;
  recovered_events: number;
  recovery_rate: number;
  escalated_events: number;
  held_for_review_events: number;
  breakdown: WorkflowBreakdownRow[];
  audit: RecoveryAuditRow[];
};

const AT_RISK_CATEGORIES = new Set(["customer_fixable", "bank_side"]);

/** Batch recovery report: money at risk, money recovered, per-workflow split and the audit log. */
export const getRecoverySummary = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const [{ data: actions, error: actionsError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase
        .from("agent_actions")
        .select(ACTION_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("events").select("id, event_type, payload").limit(1000),
    ]);
  if (actionsError) throw new Error(actionsError.message);
  if (eventsError) throw new Error(eventsError.message);

  const { summarizeEvent } = await import("./risk");
  const { customerEmailFromPayload } = await import("./agent");

  const byEvent = new Map(
    (events ?? []).map((row) => {
      const summary = summarizeEvent(row.payload);
      return [
        row.id,
        { amount: summary.amount, email: customerEmailFromPayload(row.payload as never) },
      ] as const;
    }),
  );

  const rows = (actions ?? []) as unknown as AgentAction[];
  const audit: RecoveryAuditRow[] = [];
  const breakdown = new Map<string, WorkflowBreakdownRow>();

  let atRisk = 0;
  let atRiskEvents = 0;
  let recovered = 0;
  let recoveredEvents = 0;
  let escalated = 0;
  let held = 0;
  let earliest: string | null = null;

  for (const action of rows) {
    const meta = byEvent.get(action.event_id);
    const amount = meta?.amount ?? null;
    const isAtRisk = AT_RISK_CATEGORIES.has(action.category);
    const recoveredAmount = action.recovered ? (action.recovered_amount ?? amount ?? 0) : 0;

    if (isAtRisk) {
      atRisk += amount ?? 0;
      atRiskEvents += 1;
    }
    if (action.recovered) {
      recovered += Number(recoveredAmount) || 0;
      recoveredEvents += 1;
    }
    if (action.escalated_at) escalated += 1;
    if (action.status === "flagged_for_review") held += 1;
    if (!earliest || action.created_at < earliest) earliest = action.created_at;

    const key = action.workflow ?? "—";
    const bucket =
      breakdown.get(key) ??
      { workflow: key, events: 0, at_risk_paise: 0, recovered_paise: 0, recovered_count: 0 };
    bucket.events += 1;
    if (isAtRisk) bucket.at_risk_paise += amount ?? 0;
    if (action.recovered) {
      bucket.recovered_paise += Number(recoveredAmount) || 0;
      bucket.recovered_count += 1;
    }
    breakdown.set(key, bucket);

    audit.push({
      id: action.id,
      created_at: action.created_at,
      signal: action.signal,
      workflow: action.workflow,
      decision: action.decision,
      matched_via: action.matched_via,
      status: action.status,
      category: action.category,
      recovered: Boolean(action.recovered),
      recovered_at: action.recovered_at ?? null,
      escalated_at: action.escalated_at,
      amount_paise: amount,
      recovered_amount: Number(recoveredAmount) || null,
      customer_email: meta?.email ?? null,
    });
  }

  return {
    period_start: earliest ?? new Date().toISOString(),
    generated_at: new Date().toISOString(),
    at_risk_paise: atRisk,
    at_risk_events: atRiskEvents,
    recovered_paise: recovered,
    recovered_events: recoveredEvents,
    recovery_rate: atRisk > 0 ? recovered / atRisk : 0,
    escalated_events: escalated,
    held_for_review_events: held,
    breakdown: [...breakdown.values()].sort((a, b) => a.workflow.localeCompare(b.workflow)),
    audit,
  } satisfies RecoverySummary;
});


export const listAgentActions = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select(ACTION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentAction[];
});

export const listBusinessAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("business_alerts")
    .select(ALERT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessAlert[];
});

export const updateAlertStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "acknowledged", "resolved"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { error } = await supabase
      .from("business_alerts")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Manual trigger so the dashboard reflects new webhook events without waiting for cron. */
export const runAgentNow = createServerFn({ method: "POST" }).handler(async () => {
  const { runRecoveryPipeline, executeDueRetries, runBackgroundMonitor } = await import(
    "./agent.server"
  );
  const pipeline = await runRecoveryPipeline();
  const retries = await executeDueRetries();
  const monitor = await runBackgroundMonitor();
  return { ...pipeline, ...retries, ...monitor };
});

/**
 * Demo fast-forward: pulls pending scheduled retries to now and runs them, so a
 * workflow-B escalation or workflow-C reminder can be shown without waiting.
 */
export const fireDueRetriesNow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ eventId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { fastForwardRetries } = await import("./agent.server");
    return fastForwardRetries(data.eventId);
  });
