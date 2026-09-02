import { createFileRoute } from "@tanstack/react-router";

/**
 * Called by the scheduled job every 15 minutes: rolling 60-minute failure-cluster
 * detection plus fraud routing into business_alerts.
 */
export const Route = createFileRoute("/api/public/cron/monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronToken, runBackgroundMonitor } = await import("@/lib/agent.server");
        if (!(await verifyCronToken(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runBackgroundMonitor();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("cron monitor failed", error);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
