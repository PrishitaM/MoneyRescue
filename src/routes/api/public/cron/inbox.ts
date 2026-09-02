import { createFileRoute } from "@tanstack/react-router";

/**
 * Called by the scheduled job every 10 minutes: read new customer replies and
 * advance each follow-up conversation by exactly one step.
 */
export const Route = createFileRoute("/api/public/cron/inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronToken } = await import("@/lib/agent.server");
        if (!(await verifyCronToken(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { processSupportInbox } = await import("@/lib/support.server");
          const result = await processSupportInbox();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("inbox poll failed", error);
          return Response.json({ ok: false, error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
