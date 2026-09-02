import { CATEGORY_LABELS, URGENCY_LABELS, type RiskCategory, type RiskUrgency } from "@/lib/risk";
import { WORKFLOW_ESCALATED_LABEL, workflowBadgeLabel, type WorkflowId } from "@/lib/agent";
import { cn } from "@/lib/utils";

const URGENCY_STYLES: Record<RiskUrgency, string> = {
  healthy: "border-chart-2/50 bg-chart-2/20 text-chart-2",
  high: "border-destructive/40 bg-destructive/15 text-destructive",
  medium: "border-chart-4/40 bg-chart-4/15 text-chart-4",
  low: "border-chart-3/40 bg-chart-3/15 text-chart-3",
};

const CATEGORY_STYLES: Record<RiskCategory, string> = {
  customer_fixable: "border-chart-1/40 bg-chart-1/10 text-chart-1",
  bank_side: "border-chart-3/40 bg-chart-3/10 text-chart-3",
  merchant_side: "border-chart-5/40 bg-chart-5/10 text-chart-5",
  healthy: "border-chart-2/50 bg-chart-2/15 text-chart-2",
};

const base =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider";

export function UrgencyBadge({ urgency }: { urgency: RiskUrgency }) {
  return <span className={cn(base, URGENCY_STYLES[urgency])}>{URGENCY_LABELS[urgency]}</span>;
}

export function CategoryBadge({ category }: { category: RiskCategory }) {
  return <span className={cn(base, CATEGORY_STYLES[category])}>{CATEGORY_LABELS[category]}</span>;
}

export function UnclassifiedBadge() {
  return (
    <span className={cn(base, "border-border bg-muted text-muted-foreground")}>Unclassified</span>
  );
}

const WORKFLOW_STYLES: Record<WorkflowId, string> = {
  A: "border-chart-4/50 bg-chart-4/15 text-chart-4",
  B: "border-chart-1/50 bg-chart-1/15 text-chart-1",
  C: "border-chart-2/50 bg-chart-2/15 text-chart-2",
  D: "border-destructive/50 bg-destructive/15 text-destructive",
};

/** Shows which of the four agentic workflows was applied to an event. */
export function WorkflowBadge({
  workflow,
  escalatedAt,
  className,
}: {
  workflow: string | null;
  escalatedAt: string | null;
  className?: string;
}) {
  const label = workflowBadgeLabel({ workflow, escalated_at: escalatedAt });
  if (!label || !workflow) return null;
  const escalated = label === WORKFLOW_ESCALATED_LABEL;
  return (
    <span
      className={cn(
        base,
        escalated
          ? "border-destructive/50 bg-destructive/15 text-destructive"
          : (WORKFLOW_STYLES[workflow as WorkflowId] ?? "border-border bg-muted text-muted-foreground"),
        className,
      )}
    >
      <span className="font-mono opacity-70">{workflow}</span>
      {label}
    </span>
  );
}

