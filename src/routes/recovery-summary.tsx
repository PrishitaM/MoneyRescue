import { PageHead } from "@/components/PageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { recoverySummaryQueryOptions } from "@/lib/agent.queries";
import { GUARDRAILS, WORKFLOW_LABELS, type WorkflowId } from "@/lib/agent";

export const Route = createFileRoute("/recovery-summary")({
  head: () => ({
    meta: [
      { title: "Recovery Summary — Revenue Risk Radar" },
      {
        name: "description",
        content:
          "Batch report of revenue at risk, revenue recovered, recovery rate by workflow, and the guardrails enforced in code.",
      },
      { property: "og:title", content: "Recovery Summary — Revenue Risk Radar" },
      {
        property: "og:description",
        content:
          "Measured money recovered across a batch, with workflow breakdowns and stopping rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(recoverySummaryQueryOptions),
  component: RecoverySummaryPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Recovery summary unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found</div>,
});

const rupees = (paise: number | null) =>
  paise === null
    ? "—"
    : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";



function HeroStat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-7 ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />
      <p className="relative font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`relative mt-3 font-display text-[40px] leading-none font-semibold tabular-nums sm:text-[52px] ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="relative mt-3 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
          accent ? "text-chart-2" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function RecoverySummaryPage() {
  const { data } = useSuspenseQuery(recoverySummaryQueryOptions);
  const rate = `${(data.recovery_rate * 100).toFixed(1)}%`;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-5 py-8 md:px-8 md:py-10">
      <PageHead
        title="Recovery summary"
        intro="A batch report of what the agent was handed, what it did, and how much money actually came back. Amounts are read from the Razorpay payloads on each event."
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Batch result</h2>
          <p className="font-mono text-xs text-muted-foreground">
            {stamp(data.period_start)} → {stamp(data.generated_at)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <HeroStat
            label="Revenue at risk"
            value={rupees(data.at_risk_paise)}
            note={`${data.at_risk_events} recoverable failures (customer fixable + bank side)`}
          />
          <HeroStat
            label="Revenue recovered"
            value={rupees(data.recovered_paise)}
            note={`${data.recovered_events} payments came back after an agent action`}
            accent
          />
          <HeroStat
            label="Recovery rate"
            value={rate}
            note="Recovered ÷ at risk, by value"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="Escalated after failed retry"
            value={String(data.escalated_events)}
            note="The automatic retry did not recover the payment, so a follow-up email was sent"
          />
          <Stat
            label="Held for human review"
            value={String(data.held_for_review_events)}
            note="Fraud-flagged payments never receive automated contact"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Breakdown by workflow</h2>
        <div className="overflow-x-auto rounded-sm border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Workflow</th>
                <th className="px-4 py-3 font-semibold">Events</th>
                <th className="px-4 py-3 font-semibold">At risk</th>
                <th className="px-4 py-3 font-semibold">Recovered</th>
                <th className="px-4 py-3 font-semibold">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((row) => (
                <tr key={row.workflow} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold">{row.workflow}</span>
                    <span className="ml-2 text-muted-foreground">
                      {WORKFLOW_LABELS[row.workflow as WorkflowId] ?? "No workflow (healthy / review)"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">{row.events}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{rupees(row.at_risk_paise)}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-chart-2">
                    {rupees(row.recovered_paise)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {row.at_risk_paise > 0
                      ? `${((row.recovered_paise / row.at_risk_paise) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
              {data.breakdown.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                    No agent actions recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Guardrails &amp; stopping rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These are enforced in the pipeline itself, not policy on paper.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {GUARDRAILS.map((rule) => (
            <div key={rule.title} className="rounded-sm border border-border bg-card p-5">
              <span className="inline-flex rounded-[2px] border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                {rule.enforcedIn}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{rule.detail}</p>
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}
