# MoneyRescue

**AI Revenue Recovery — detect, diagnose, and recover failed payments automatically.**

MoneyRescue ingests real-time payment failure events, classifies the root cause against a researched
failure-signal knowledge base, and runs a bounded, differentiated recovery workflow per failure type —
from immediate customer emails to silent retries to human escalation for suspected fraud — with a full
audit trail of every decision made.

Built for the Razorpay Buildathon, Track 03: AI Revenue Recovery.

## The problem

Revenue loss from payments rarely happens in one clean step — a card expires, a bank declines a
charge, a gateway times out. Left unhandled, these failures quietly become churn. MoneyRescue closes
the loop from detecting the failure to diagnosing why it happened, choosing the right intervention,
and executing a bounded recovery action — automatically.

## How it works

1. **Detect** — a signed webhook receiver ingests real Razorpay payment events and stores them.
2. **Diagnose** — each event is matched against a knowledge base of researched failure signals
   (card issues, bank declines, gateway errors, fraud holds), falling back to an LLM classifier
   for unrecognized reasons.
3. **Decide** — the failure's category routes it to one of four distinct workflows:
   - **Immediate Fix Request** — customer-fixable issues (expired card, wrong CVV) get a tailored
     email immediately, no retry.
   - **Silent Retry First** — transient bank/gateway issues get a quiet retry before any customer
     contact.
   - **Delayed Nudge** — insufficient-funds cases get a gentle heads-up now, with a follow-up
     reminder timed for a likely payday.
   - **Hold for Human** — anything flagged as suspected fraud is never auto-contacted or retried;
     it's routed straight to human review.
4. **Recover** — the agent sends real, personalized recovery emails, handles limited customer
   replies (up to two automated exchanges before requiring explicit resolution or human handoff),
   and lets a human support agent step in and take over any conversation at any time.
5. **Report** — a Recovery Summary shows revenue at risk vs. recovered, and a compliance-style
   Audit Trail logs every decision the agent made and why.

## Guardrails

- One action per event — no duplicate emails or retries (idempotency enforced).
- Suspected-fraud events are never auto-contacted or auto-retried — human review only.
- Automated replies are capped at two exchanges per conversation before requiring explicit
  resolution or escalation to a human.
- A human agent can take over any conversation at any time; the AI stops replying on that thread
  once a human responds.
- Dry-run mode available for safe testing without sending real emails.

## Tech stack

- **Frontend**: React (TanStack Start)
- **Backend**: Supabase (Postgres, Edge Functions, scheduled jobs via pg_cron)
- **Payments**: Razorpay (webhooks, orders, payment links)
- **LLM fallback classification**: Groq
- **Email**: Resend

## Running locally

Requires Node.js and npm.

```
git clone https://github.com/PrishitaM/MoneyRescue.git
cd MoneyRescue
npm install
```

Create a `.env` file in the project root with the following (values are not included in this repo):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
GROQ_API_KEY=
RESEND_API_KEY=
DRY_RUN=true
```

Then:

```
npm run dev
```

Open `http://localhost:8080`.

## Note on Razorpay test mode

This account's Razorpay test environment does not have Subscriptions or UPI enabled, so recovery
actions use one-time Orders and Payment Links rather than tokenized recurring charges — this is
documented as a real-world account constraint, not a design limitation, and the recovery logic is
built to work the same way against a fully-enabled production account.

