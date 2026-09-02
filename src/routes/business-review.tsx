import { PageHead } from "@/components/PageHead";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { agentActionsQueryOptions, businessAlertsQueryOptions } from "@/lib/agent.queries";
import { supportThreadsQueryOptions } from "@/lib/support.queries";
import { checkInboxNow, resolveThread, sendManualReply } from "@/lib/support.functions";
import { SUPPORT_STATE_LABELS, type SupportThread } from "@/lib/support";
import { eventsQueryOptions } from "@/lib/risk.queries";
import { updateAlertStatus } from "@/lib/agent.functions";
import { formatAmount, summarizeEvent, type RiskEvent } from "@/lib/risk";
import type { AgentAction, BusinessAlert } from "@/lib/agent";

export const Route = createFileRoute("/business-review")({
  head: () => ({
    meta: [
      { title: "Business Review — Revenue Risk Radar" },
      {
        name: "description",
        content:
          "Human review queue for suspected bank outages, unclassified failure spikes and fraud-flagged Razorpay payments.",
      },
      { property: "og:title", content: "Business Review — Revenue Risk Radar" },
      {
        property: "og:description",
        content:
          "Review suspected bank outages, unclassified spikes and fraud-flagged payments before taking any action.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(businessAlertsQueryOptions),
      context.queryClient.ensureQueryData(agentActionsQueryOptions),
      context.queryClient.ensureQueryData(eventsQueryOptions),
      context.queryClient.ensureQueryData(supportThreadsQueryOptions),
    ]);
  },
  component: BusinessReviewPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Review queue unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found</div>,
});

const ALERT_LABELS: Record<string, string> = {
  bank_outage_suspected: "Bank outage suspected",
  support_escalation: "Support callback requested",
  fraud_spike: "Fraud suspected",
  unclassified_spike: "Unclassified spike",
};

const fmt = (value: string) =>
  new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

function AlertCard({
  alert,
  onAcknowledge,
  pending,
}: {
  alert: BusinessAlert;
  onAcknowledge: (id: string) => void;
  pending: boolean;
}) {
  return (
    <li className="rounded-sm border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-[2px] border border-chart-4/40 bg-chart-4/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-chart-4">
            {ALERT_LABELS[alert.alert_type] ?? alert.alert_type}
          </span>
          <p className="mt-2 text-sm text-foreground">{alert.summary}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {alert.affected_count} affected · {fmt(alert.time_window_start)} →{" "}
            {fmt(alert.time_window_end)}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAcknowledge(alert.id)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
        >
          Acknowledge
        </button>
      </div>
    </li>
  );
}

function FraudEventCard({
  event,
  action,
  alert,
  onReviewed,
  pending,
}: {
  event: RiskEvent | undefined;
  action: AgentAction;
  alert: BusinessAlert | undefined;
  onReviewed: (id: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = event ? summarizeEvent(event.payload) : null;
  const amount = summary ? formatAmount(summary.amount, summary.currency) : null;

  return (
    <li className="rounded-sm border border-destructive/30 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-[2px] border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
              Fraud suspected
            </span>
            <span className="font-mono text-sm">{action.signal}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{action.reasoning}</p>
          <dl className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
            {summary?.paymentId && <div>payment: {summary.paymentId}</div>}
            {amount && <div>amount: {amount}</div>}
            <div>flagged: {fmt(action.created_at)}</div>
          </dl>
          {event && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {open ? "Hide raw payload" : "Show raw payload"}
              </button>
              {open && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
        {alert && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onReviewed(alert.id)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
          >
            Mark reviewed
          </button>
        )}
      </div>
    </li>
  );
}

const STATE_STYLES: Record<string, string> = {
  awaiting_question: "border-border bg-muted/40 text-muted-foreground",
  awaiting_confirmation: "border-primary/40 bg-primary/10 text-primary",
  closed_satisfied: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  closed_by_human: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  escalated: "border-destructive/40 bg-destructive/10 text-destructive",
  human_owned: "border-chart-4/40 bg-chart-4/10 text-chart-4",
};

function MessageBubble({
  message,
}: {
  message: NonNullable<SupportThread["support_messages"]>[number];
}) {
  const isCustomer = message.sender === "customer";
  const isHuman = message.sender === "human_agent";
  return (
    <li
      className={`rounded-md border p-3 ${
        isCustomer
          ? "border-border bg-muted/40"
          : isHuman
            ? "border-chart-4/40 bg-chart-4/10"
            : "border-primary/25 bg-primary/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isCustomer ? "Customer" : isHuman ? "Sent by support team" : "AI agent"}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{fmt(message.created_at)}</span>
      </div>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
        {message.body}
      </pre>
    </li>
  );
}

function ThreadCard({ thread }: { thread: SupportThread }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const sendReply = useServerFn(sendManualReply);
  const closeThread = useServerFn(resolveThread);
  const messages = thread.support_messages ?? [];
  const isClosed = thread.state === "closed_satisfied" || thread.state === "closed_by_human";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["support_threads"] });
  };

  const replyMutation = useMutation({
    mutationFn: (body: string) => sendReply({ data: { threadId: thread.id, body } }),
    onSuccess: () => {
      toast.success("Reply sent — this thread is now handled by the support team");
      setDraft("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolveMutation = useMutation({
    mutationFn: () => closeThread({ data: { threadId: thread.id } }),
    onSuccess: () => {
      toast.success("Thread marked resolved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <li className="rounded-sm border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-[2px] border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
            STATE_STYLES[thread.state] ?? "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {SUPPORT_STATE_LABELS[thread.state] ?? thread.state}
        </span>
        {thread.human_owned && (
          <span className="inline-flex rounded-[2px] border border-chart-4/40 bg-chart-4/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-chart-4">
            Human-owned · AI paused
          </span>
        )}
        <span className="text-sm font-medium">{thread.customer_email}</span>
        <span className="font-mono text-xs text-muted-foreground">{fmt(thread.updated_at)}</span>
        <span className="text-xs text-muted-foreground">
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          disabled={resolveMutation.isPending || isClosed}
          onClick={() => resolveMutation.mutate()}
          className="ml-auto rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
        >
          {isClosed ? "Resolved" : resolveMutation.isPending ? "Resolving…" : "Mark resolved"}
        </button>
      </div>
      {thread.customer_question && (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Latest customer message: </span>
          {thread.customer_question.slice(0, 400)}
        </p>
      )}
      {messages.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {open ? "Hide full conversation" : `Show full conversation (${messages.length})`}
          </button>
          {open && (
            <ol className="mt-3 space-y-3">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ol>
          )}
        </>
      ) : (
        (thread.ai_answer || thread.final_reply) && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {open ? "Hide conversation" : "Show conversation"}
            </button>
            {open && (
              <div className="mt-2 space-y-3">
                {thread.ai_answer && (
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-sans text-xs text-muted-foreground">
                    {thread.ai_answer}
                  </pre>
                )}
                {thread.final_reply && (
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-sans text-xs text-muted-foreground">
                    {thread.final_reply}
                  </pre>
                )}
              </div>
            )}
          </>
        )
      )}

      <div className="mt-4 border-t border-border pt-4">
        <label
          htmlFor={`reply-${thread.id}`}
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Reply as support executive
        </label>
        <textarea
          id={`reply-${thread.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Type the message the customer will receive by email…"
          className="mt-2 w-full rounded-md border border-border bg-background p-3 font-sans text-xs text-foreground outline-none focus:border-primary"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Sent as a reply on the same email thread. The AI stops auto-replying once you send.
          </p>
          <button
            type="button"
            disabled={replyMutation.isPending || draft.trim().length < 2}
            onClick={() => replyMutation.mutate(draft.trim())}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {replyMutation.isPending ? "Sending…" : "Send Reply"}
          </button>
        </div>
      </div>
    </li>
  );
}



function BusinessReviewPage() {
  const { data: alerts } = useSuspenseQuery(businessAlertsQueryOptions);
  const { data: actions } = useSuspenseQuery(agentActionsQueryOptions);
  const { data: events } = useSuspenseQuery(eventsQueryOptions);
  const { data: threads } = useSuspenseQuery(supportThreadsQueryOptions);
  const queryClient = useQueryClient();
  const pollInbox = useServerFn(checkInboxNow);

  const inboxMutation = useMutation({
    mutationFn: () => pollInbox({}),
    onSuccess: (result) => {
      toast.success(
        `Inbox checked · ${result.answered} answered · ${result.closed} resolved · ${result.escalated} escalated`,
      );
      void queryClient.invalidateQueries({ queryKey: ["support_threads"] });
      void queryClient.invalidateQueries({ queryKey: ["business_alerts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setStatus = useServerFn(updateAlertStatus);

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: "acknowledged" | "resolved" }) =>
      setStatus({ data: input }),
    onSuccess: () => {
      toast.success("Updated");
      void queryClient.invalidateQueries({ queryKey: ["business_alerts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openAlerts = useMemo(
    () => alerts.filter((a) => a.status === "open" && a.alert_type !== "fraud_spike"),
    [alerts],
  );
  const fraudActions = useMemo(
    () => actions.filter((a) => a.category === "fraud_suspected"),
    [actions],
  );
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const fraudAlertByEvent = useMemo(
    () =>
      new Map(
        alerts
          .filter((a) => a.alert_type === "fraud_spike" && a.event_id && a.status === "open")
          .map((a) => [a.event_id!, a]),
      ),
    [alerts],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-10">
      <PageHead
        title="Review desk"
        intro="Failure clusters the monitor spotted, payments held back as suspected fraud, and customer follow-up conversations. Nothing on this page is acted on automatically."
      />

      <div className="mt-8 lg:grid lg:grid-cols-2 lg:gap-6">
        <section className="lg:max-h-[70vh] lg:overflow-y-auto">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Open alerts
          </h2>
          {openAlerts.length === 0 ? (
            <p className="mt-3 rounded-sm border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
              No open alerts. The monitor raises one when five or more payments fail with the same
              signal inside an hour.
            </p>
          ) : (
            <ul className="mt-3 space-y-3 pr-1">
              {openAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  pending={mutation.isPending}
                  onAcknowledge={(id) => mutation.mutate({ id, status: "acknowledged" })}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 lg:mt-0 lg:max-h-[70vh] lg:overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Customer follow-up conversations
            </h2>
            <button
              type="button"
              disabled={inboxMutation.isPending}
              onClick={() => inboxMutation.mutate()}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
            >
              {inboxMutation.isPending ? "Checking inbox…" : "Check inbox now"}
            </button>
          </div>
          {threads.length === 0 ? (
            <p className="mt-3 rounded-sm border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
              No customer replies yet. Every recovery email invites a reply; the inbox is polled every
              10 minutes, the AI answers once, then one YES/NO closes or escalates the thread.
            </p>
          ) : (
            <ul className="mt-3 space-y-3 pr-1">
              {threads.map((thread) => (
                <ThreadCard key={thread.id} thread={thread} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Fraud-flagged payments
        </h2>
        {fraudActions.length === 0 ? (
          <p className="mt-3 rounded-sm border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
            No fraud-flagged payments. These never enter the customer recovery pipeline.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {fraudActions.map((action) => (
              <FraudEventCard
                key={action.id}
                action={action}
                event={eventById.get(action.event_id)}
                alert={fraudAlertByEvent.get(action.event_id)}
                pending={mutation.isPending}
                onReviewed={(id) => mutation.mutate({ id, status: "resolved" })}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
