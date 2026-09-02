import { PageHead } from "@/components/PageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { recoverySummaryQueryOptions } from "@/lib/agent.queries";
import type { RecoveryAuditRow } from "@/lib/agent.functions";
import { WORKFLOW_LABELS, type WorkflowId } from "@/lib/agent";

export const Route = createFileRoute("/audit-trail")({
  head: () => ({
    meta: [
      { title: "Audit Trail — Revenue Risk Radar" },
      {
        name: "description",
        content: "Every automated decision in order, with full signal analysis and outcome tracking.",
      },
      { property: "og:title", content: "Audit Trail — Revenue Risk Radar" },
      {
        property: "og:description",
        content: "Detailed logs of agent decisions, workflow matches, and recovery outcomes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(recoverySummaryQueryOptions),
  component: AuditTrailPage,
});

const rupees = (paise: number | null) =>
  paise === null
    ? "—"
    : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";

const MATCHED_VIA_LABELS: Record<string, string> = {
  knowledge_base: "Knowledge base",
  llm_fallback: "AI fallback",
};

function outcomeOf(row: RecoveryAuditRow): { label: string; tone: string } {
  if (row.recovered) return { label: "Recovered", tone: "text-chart-2" };
  if (row.escalated_at) return { label: "Escalated", tone: "text-destructive" };
  if (row.status === "flagged_for_review")
    return { label: "Held for review", tone: "text-chart-4" };
  if (row.status === "sent") return { label: "Sent", tone: "text-foreground" };
  if (row.status === "skipped") return { label: "No action", tone: "text-muted-foreground" };
  return { label: "Pending", tone: "text-muted-foreground" };
}

function AuditTrailPage() {
  const { data } = useSuspenseQuery(recoverySummaryQueryOptions);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-5 py-8 md:px-8 md:py-10">
      <PageHead
        title="Audit trail"
        intro="Every automated decision in order, showing how signals were matched and what the final recovery outcome was."
      />

      <section className="space-y-4">
        <div className="overflow-x-auto rounded-sm border border-border bg-card">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Timestamp (IST)</th>
                <th className="px-4 py-3 font-semibold">Signal</th>
                <th className="px-4 py-3 font-semibold">Workflow</th>
                <th className="px-4 py-3 font-semibold">Decision</th>
                <th className="px-4 py-3 font-semibold">Matched via</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((row) => {
                const outcome = outcomeOf(row);
                return (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      {stamp(row.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.signal}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {row.workflow ?? "—"}
                      {row.workflow && (
                        <span className="ml-2 hidden text-[10px] text-muted-foreground lg:inline">
                          ({WORKFLOW_LABELS[row.workflow as WorkflowId]})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{row.decision.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {MATCHED_VIA_LABELS[row.matched_via] ?? row.matched_via}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                      {rupees(row.recovered ? row.recovered_amount : row.amount_paise)}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold ${outcome.tone}`}>{outcome.label}</td>
                  </tr>
                );
              })}
              {data.audit.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={7}>
                    The audit trail is empty — no agent actions have run yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
