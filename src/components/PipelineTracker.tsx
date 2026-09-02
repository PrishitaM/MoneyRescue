import { Check } from "lucide-react";

import type { AgentAction } from "@/lib/agent";

type Step = {
  label: string;
  detail: string;
  state: "done" | "current" | "todo";
  tone?: "ok" | "warn" | "danger" | undefined;
};

/**
 * Horizontal progress tracker showing how far one event travelled through the
 * agent: Payment failed → Diagnosed → Workflow selected → Action taken → Outcome.
 * Presentation only — every value is read from the existing action row.
 */
export function PipelineTracker({
  action,
  classified,
  signal,
}: {
  action: AgentAction | undefined;
  classified: boolean;
  signal: string | null;
}) {
  const outcome = (() => {
    if (!action) return null;
    if (action.recovered) return { label: "Recovered", tone: "ok" as const };
    if (action.escalated_at) return { label: "Escalated", tone: "danger" as const };
    if (action.status === "flagged_for_review")
      return { label: "Held for review", tone: "warn" as const };
    if (action.status === "resolved") return { label: "Resolved", tone: "ok" as const };
    return null;
  })();
  const actionDetail = action
    ? action.status === "sent"
      ? "email delivered"
      : action.status === "pending" && action.email_body
        ? "delivery failed"
        : action.status.replace(/_/g, " ")
    : "waiting for agent";

  const steps: Step[] = [
    {
      label: "Event received",
      detail: signal ? `signal: ${signal}` : "webhook stored",
      state: "done",
    },
    {
      label: "Diagnosed",
      detail: classified
        ? action?.matched_via === "llm_fallback"
          ? "AI fallback"
          : "knowledge base"
        : "unclassified",
      state: classified ? "done" : "current",
    },
    {
      label: "Workflow selected",
      detail: action?.workflow ? `workflow ${action.workflow}` : "not routed yet",
      state: action?.workflow ? "done" : "todo",
    },
    {
      label: "Action taken",
      detail: actionDetail,
      state: action ? (action.status === "pending" ? "current" : "done") : "todo",
      tone: action?.status === "sent" ? "ok" : action?.email_body ? "warn" : undefined,
    },
    {
      label: outcome?.label ?? "Outcome",
      detail: outcome ? "closed out" : "awaiting outcome",
      state: outcome ? "done" : "todo",
      tone: outcome?.tone,
    },
  ];

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {steps.map((step, index) => {
        const done = step.state === "done";
        const current = step.state === "current";
        const toneRing =
          step.tone === "danger"
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : step.tone === "warn"
              ? "border-chart-4/50 bg-chart-4/10 text-chart-4"
              : step.tone === "ok"
                ? "border-chart-2/50 bg-chart-2/10 text-chart-2"
                : done
                  ? "border-primary/45 bg-primary/10 text-primary"
                  : current
                    ? "border-chart-4/50 bg-chart-4/10 text-chart-4"
                    : "border-border bg-muted/40 text-muted-foreground";
        return (
          <li key={step.label} className="min-w-0">
            <div className={`h-full rounded-lg border px-2.5 py-2 ${toneRing}`}>
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current">
                  {done ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : (
                    <span className="font-mono text-[9px] leading-none">{index + 1}</span>
                  )}
                </span>
                <span className="text-[11px] font-semibold uppercase leading-tight tracking-wider">
                  {step.label}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {step.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
