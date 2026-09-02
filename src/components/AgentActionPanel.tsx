import { useState } from "react";

import { WorkflowBadge } from "@/components/RiskBadges";
import {
  DECISION_LABELS,
  WORKFLOW_DESCRIPTIONS,
  type AgentAction,
  type WorkflowId,
} from "@/lib/agent";

export function AgentActionPanel({ action }: { action: AgentAction }) {
  const [emailOpen, setEmailOpen] = useState(true);
  const workflowNote = action.workflow
    ? WORKFLOW_DESCRIPTIONS[action.workflow as WorkflowId]
    : null;
  const deliveryFailed = Boolean(action.email_body) && action.status !== "sent";

  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      {action.workflow && (
        <div className="mb-2 border-b border-border pb-2">
          <WorkflowBadge workflow={action.workflow} escalatedAt={action.escalated_at} />
          {workflowNote && (
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{workflowNote}</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-[2px] border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          {DECISION_LABELS[action.decision] ?? action.decision}
        </span>
        <span
          className={`inline-flex rounded-[2px] border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
            action.matched_via === "llm_fallback"
              ? "border-chart-4/40 bg-chart-4/10 text-chart-4"
              : "border-chart-2/40 bg-chart-2/10 text-chart-2"
          }`}
        >
          {action.matched_via === "llm_fallback" ? "AI fallback" : "Knowledge base"}
        </span>
        <span className="font-mono text-[11px] uppercase text-muted-foreground">
          {action.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{action.reasoning}</p>
      <div
        className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${
          action.status === "sent"
            ? "border-chart-2/40 bg-chart-2/10 text-chart-2"
            : deliveryFailed
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-muted-foreground"
        }`}
      >
        {action.status === "sent"
          ? `Email sent${action.sent_at ? ` at ${new Date(action.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}`
          : deliveryFailed
            ? "Email drafted, but delivery failed. See the delivery reason above."
            : `Action status: ${action.status.replace(/_/g, " ")}`}
      </div>
      {action.scheduled_for && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          retry at {new Date(action.scheduled_for).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </p>
      )}
      {action.email_body && (
        <>
          <button
            type="button"
            onClick={() => setEmailOpen((value) => !value)}
            className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {emailOpen ? "Hide email" : "Show email"}
          </button>
          {emailOpen && (
            <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
              <div className="text-xs font-semibold text-foreground">{action.email_subject}</div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                {action.email_body}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}