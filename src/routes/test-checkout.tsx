import { PageHead } from "@/components/PageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { createRazorpayOrder } from "@/lib/checkout.functions";
import { simulateFailureEvent } from "@/lib/simulate.functions";
import { SIMULATED_FAILURES } from "@/lib/simulate";
import type { AgentAction } from "@/lib/agent";
import { AgentActionPanel } from "@/components/AgentActionPanel";
import { PipelineTracker } from "@/components/PipelineTracker";

export const Route = createFileRoute("/test-checkout")({
  head: () => ({
    meta: [
      { title: "Test Checkout — Revenue Risk Radar" },
      {
        name: "description",
        content:
          "Simulate any real Razorpay card failure reason or run a live Test Mode checkout, then watch the recovery agent diagnose it and send the email.",
      },
      { property: "og:title", content: "Test Checkout — Revenue Risk Radar" },
      {
        property: "og:description",
        content:
          "Trigger each Razorpay failure signal and see the knowledge-base decision, retry schedule and AI-written recovery email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TestCheckout,
});

const THEME_COLOR = "#0d1526";
const REAL = "__real__";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on?: (event: string, cb: (payload?: unknown) => void) => void;
    };
  }
}

function TestCheckout() {
  const [mode, setMode] = useState<string>(REAL);
  const [amount, setAmount] = useState("100");
  const [email, setEmail] = useState("");
  const [scriptState, setScriptState] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<AgentAction | null>(null);

  const createOrder = useServerFn(createRazorpayOrder);
  const simulate = useServerFn(simulateFailureEvent);

  useEffect(() => {
    const saved = window.localStorage.getItem("radar_test_email");
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    if (window.Razorpay) {
      setScriptState("ready");
      return;
    }
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => setScriptState("ready");
    const onError = () => setScriptState("error");
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = src;
      script.async = true;
      document.body.appendChild(script);
    }
    return () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  }, []);

  async function runRealCheckout(rupees: number) {
    if (!window.Razorpay) {
      setStatus("Razorpay Checkout hasn't loaded yet — try again in a moment.");
      return;
    }
    setStatus("Creating order…");
    const { orderId, keyId, amountPaise } = await createOrder({ data: { amount: rupees } });
    setStatus(`Order ${orderId} created — completing payment in the widget.`);

    const rzp = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount: amountPaise,
      currency: "INR",
      name: "Revenue Risk Radar Test",
      description: "Test subscription charge",
      prefill: email ? { email } : undefined,
      theme: { color: THEME_COLOR },
      handler: () => setStatus("Payment attempt completed — check the dashboard for the event."),
      modal: { ondismiss: () => setStatus("Checkout closed before completing the attempt.") },
    });
    rzp.on?.("payment.failed", () =>
      setStatus("Payment attempt failed — check the dashboard for the event."),
    );
    rzp.open();
  }

  async function submit() {
    const selected = mode;
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setStatus("Enter a valid amount in rupees.");
      return;
    }
    if (selected !== REAL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setStatus("Enter the customer email address the recovery email should go to.");
      return;
    }

    setBusy(true);
    setAction(null);
    try {
      if (selected === REAL) {
        await runRealCheckout(rupees);
      } else {
        window.localStorage.setItem("radar_test_email", email);
        setStatus("Delivering webhook event and running the recovery agent…");
        const out = await simulate({ data: { signal: selected, email, amount: rupees } });
        setAction(out.action);
        setStatus(
          out.action
            ? out.action.status === "sent"
              ? `Event ${out.eventId} diagnosed — email sent successfully.`
              : `Event ${out.eventId} diagnosed — email delivery failed: ${out.action.reasoning}`
            : `Event ${out.eventId} stored, but the agent produced no action.`,
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8 md:py-10">
      <PageHead
        title="Payment simulator"
        intro="Pick any real Razorpay card failure reason, or run a live Test Mode checkout, and watch the recovery agent diagnose it and write the customer email end to end."
      />

      <section className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Manual run &amp; live checkout
        </h2>
        <div>
          <label
            htmlFor="mode"
            className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Simulate failure reason
          </label>
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value={REAL}>Real Checkout (Create Order &amp; Pay in Razorpay widget)</option>
            {SIMULATED_FAILURES.map((f) => (
              <option key={f.signal} value={f.signal}>
                {f.label} ({f.signal})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="email"
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Customer email
            </label>
            <input
              id="email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="amount"
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Amount (₹)
            </label>
            <input
              id="amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || (mode === REAL && scriptState !== "ready")}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy
            ? "Working…"
            : mode === REAL
              ? scriptState === "ready"
                ? "Create Order & Pay"
                : "Loading Checkout…"
              : "Trigger failure & run agent"}
        </button>

        {scriptState === "error" && mode === REAL && (
          <p className="text-sm text-destructive">
            Couldn't load Razorpay Checkout. Check your network and reload.
          </p>
        )}

        {status && (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">{status}</p>
        )}

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Payment outcomes are recorded by the webhook receiver, not by this page.
        </p>
      </section>

      {action && (
        <section className="mt-6 border-t-2 border-foreground pt-5">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Agent action
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-foreground">
                Diagnosis, workflow and email
              </h2>
            </div>
            <span className="font-mono text-[11px] uppercase text-muted-foreground">
              {action.status === "sent" ? "Delivery confirmed" : "Attention required"}
            </span>
          </div>
          <PipelineTracker action={action} classified signal={action.signal} />
          <div className="mt-5">
            <AgentActionPanel action={action} />
          </div>
        </section>
      )}
    </main>
  );
}
