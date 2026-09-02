import { createFileRoute } from "@tanstack/react-router";

/**
 * Called by the scheduled job every 5 minutes: classify new events, act on them,
 * then execute any scheduled retries that are due.
 */
export const Route = createFileRoute("/api/public/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronToken, runRecoveryPipeline, executeDueRetries } = await import(
          "@/lib/agent.server"
        );
        if (!(await verifyCronToken(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const pipeline = await runRecoveryPipeline();
          const retries = await executeDueRetries();
          return Response.json({ ok: true, ...pipeline, ...retries });
        } catch (error) {
          console.error("cron tick failed", error);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
