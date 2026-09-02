import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { eventsQueryOptions, rulesQueryOptions } from "@/lib/risk.queries";
import { agentActionsQueryOptions } from "@/lib/agent.queries";
import { runAgentNow } from "@/lib/agent.functions";
import type { AgentAction } from "@/lib/agent";
import {
  detectionLagSeconds,
  formatAmount,
  matchRule,
  summarizeEvent,
  type RiskEvent,
  type RiskRule,
  type RiskUrgency,
} from "@/lib/risk";
import {
  CategoryBadge,
  UnclassifiedBadge,
  UrgencyBadge,
} from "@/components/RiskBadges";
import { AgentActionPanel } from "@/components/AgentActionPanel";
import { PageHead } from "@/components/PageHead";
import { PipelineTracker } from "@/components/PipelineTracker";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Revenue Risk Radar — Involuntary Churn Diagnosis" },
      {
        name: "description",
        content:
          "Detect failed recurring card payments from Razorpay subscription webhooks and diagnose the root cause of involuntary churn.",
      },
      { property: "og:title", content: "Revenue Risk Radar — Involuntary Churn Diagnosis" },
      {
        property: "og:description",
        content:
          "Live diagnosis of Razorpay subscription payment failures: root cause, category, urgency and recommended action.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(eventsQueryOptions),
      context.queryClient.ensureQueryData(rulesQueryOptions),
      context.queryClient.ensureQueryData(agentActionsQueryOptions),
    ]);
  },
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Radar offline</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found</div>,
});


function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "warn" | "ok" | "muted";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-chart-4"
        : tone === "ok"
          ? "text-chart-2"
          : "text-foreground";
  const dotClass =
    tone === "danger"
      ? "bg-destructive"
      : tone === "warn"
        ? "bg-chart-4"
        : tone === "ok"
          ? "bg-chart-2"
          : "bg-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)]">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className={`mt-2 font-display text-[32px] leading-none font-semibold ${toneClass}`}>
        {value}
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full w-1/2 rounded-full ${dotClass} opacity-60`} />
      </div>
    </div>
  );
}


function EventRow({
  event,
  rules,
  action,
}: {
  event: RiskEvent;
  rules: RiskRule[];
  action: AgentAction | undefined;
}) {
  const [open, setOpen] = useState(false);
  const { rule, signal } = matchRule(event.event_type, event.payload, rules);

  const summary = summarizeEvent(event.payload);
  const lag = detectionLagSeconds(event);
  const amount = formatAmount(summary.amount, summary.currency);

  const dotTone =
    !rule
      ? "bg-muted-foreground"
      : rule.urgency === "high"
        ? "bg-destructive"
        : rule.urgency === "medium"
          ? "bg-chart-4"
          : rule.urgency === "healthy"
            ? "bg-chart-2"
            : "bg-chart-3";

  return (
    <li className="border-b border-border transition-colors last:border-0 hover:bg-accent/25">
      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone}`} />
            <span className="font-mono text-sm font-medium text-foreground">
              {event.event_type}
            </span>
            {rule ? <UrgencyBadge urgency={rule.urgency} /> : <UnclassifiedBadge />}
          </div>

          <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">Signal</dt>
              <dd className="font-mono text-foreground/80">{signal ?? "—"}</dd>
            </div>
            {summary.subscriptionId && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Subscription</dt>
                <dd className="truncate font-mono">{summary.subscriptionId}</dd>
              </div>
            )}
            {summary.paymentId && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Payment</dt>
                <dd className="truncate font-mono">{summary.paymentId}</dd>
              </div>
            )}
            {amount && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Amount</dt>
                <dd className="font-mono">{amount}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">Received</dt>
              <dd className="font-mono">
                {new Date(event.received_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                {lag !== null && <span className="text-muted-foreground/70"> · +{lag}s</span>}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {open ? "Hide agent pipeline & payload" : "Show agent pipeline & payload"}
          </button>
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-gradient-to-br from-accent/40 via-card to-card p-4 shadow-[var(--shadow-card)]">
          {rule ? (
            <div className="space-y-2">
              <CategoryBadge category={rule.category} />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Root cause
                </div>
                <p className="text-sm text-foreground">{rule.root_cause}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Recommended action
                </div>
                <p className="text-sm text-foreground/90">{rule.recommended_action}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                No rule matches this event yet, so its root cause is unknown.
              </p>
              <Link
                to="/rules"
                search={signal ? { signal } : {}}
                className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Add rule for “{signal ?? "unknown"}”
              </Link>
            </div>
          )}
          {action && <div className="mt-3"><AgentActionPanel action={action} /></div>}
        </div>

        {open && (
          <div className="space-y-3 md:col-span-2">
            <div className="rounded-lg border border-border bg-card/60 p-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Agent pipeline
              </p>
              <PipelineTracker action={action} classified={Boolean(rule)} signal={signal} />
            </div>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </li>
  );
}

function Dashboard() {
  const { data: events } = useSuspenseQuery(eventsQueryOptions);
  const { data: rules } = useSuspenseQuery(rulesQueryOptions);
  const { data: actions } = useSuspenseQuery(agentActionsQueryOptions);
  const queryClient = useQueryClient();
  const triggerAgent = useServerFn(runAgentNow);

  const actionByEvent = useMemo(
    () => new Map(actions.map((a) => [a.event_id, a])),
    [actions],
  );

  const run = useMutation({
    mutationFn: () => triggerAgent({}),
    onSuccess: () => {
      toast.success("Recovery pipeline ran");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });



  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let today = 0;
    let unclassified = 0;
    const byUrgency: Record<RiskUrgency, number> = { healthy: 0, low: 0, medium: 0, high: 0 };
    for (const event of events) {
      if (new Date(event.received_at) >= startOfToday) today += 1;
      const { rule } = matchRule(event.event_type, event.payload, rules);
      if (rule) byUrgency[rule.urgency] += 1;
      else unclassified += 1;
    }
    return { today, unclassified, byUrgency };
  }, [events, rules]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <PageHead
        title="Revenue Risk Radar"
        intro="Every Razorpay payment webhook we receive, read against the failure knowledge base to separate customers who lost access from customers who left."
        actions={
          <div className="max-w-[15rem] text-right">
            <button
              type="button"
              disabled={run.isPending}
              onClick={() => run.mutate()}
              className="w-full border-2 border-foreground bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-primary hover:border-primary disabled:opacity-50"
            >
              {run.isPending ? "Running…" : "Run agent now"}
            </button>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Processes any event the agent hasn't handled yet: diagnoses it, sends or drafts the
              recovery email, fires due retries and re-checks for failure clusters. Same work the
              schedule does automatically — this just skips the wait.
            </p>
          </div>
        }
      />

      <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Events today" value={stats.today} />
        <Stat label="Healthy" value={stats.byUrgency.healthy} tone="ok" />
        <Stat label="Low" value={stats.byUrgency.low} tone="muted" />
        <Stat label="Medium" value={stats.byUrgency.medium} tone="warn" />
        <Stat label="High" value={stats.byUrgency.high} tone="danger" />
      </section>

      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Event stream
          </h2>
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {events.length} stored
          </span>
        </div>

        {events.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No events yet. Point your Razorpay webhook at{" "}
              <code className="font-mono text-foreground">/api/public/webhook/razorpay</code> and
              failures will appear here.
            </p>
          </div>
        ) : (
          <ul>
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                rules={rules}
                action={actionByEvent.get(event.id)}
              />
            ))}

          </ul>
        )}
      </section>
    </main>
  );
}
