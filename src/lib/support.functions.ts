import { createServerFn } from "@tanstack/react-start";

import { createPublicClient } from "./risk.server";
import type { SupportThread } from "./support";

const THREAD_COLUMNS =
  "id, event_id, human_owned, human_owned_at, customer_email, original_subject, gmail_thread_id, state, customer_question, ai_answer, customer_confirmation, final_reply, matched_via, created_at, updated_at, support_messages(id, sender, body, created_at)";

export const listSupportThreads = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("support_threads")
    .select(THREAD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const threads = (data ?? []) as unknown as SupportThread[];
  return threads.map((thread) => ({
    ...thread,
    support_messages: [...(thread.support_messages ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  }));
});

/** Manual trigger so the demo doesn't have to wait for the 10-minute poll. */
export const checkInboxNow = createServerFn({ method: "POST" }).handler(async () => {
  const { processSupportInbox } = await import("./support.server");
  return await processSupportInbox();
});

export const sendManualReply = createServerFn({ method: "POST" })
  .inputValidator((data: { threadId: string; body: string }) => {
    if (!data?.threadId) throw new Error("threadId is required");
    if (!data?.body || data.body.trim().length < 2) throw new Error("Reply is empty");
    return { threadId: data.threadId, body: data.body.slice(0, 5000) };
  })
  .handler(async ({ data }) => {
    const { sendHumanReply } = await import("./support.server");
    return await sendHumanReply(data);
  });

export const resolveThread = createServerFn({ method: "POST" })
  .inputValidator((data: { threadId: string }) => {
    if (!data?.threadId) throw new Error("threadId is required");
    return { threadId: data.threadId };
  })
  .handler(async ({ data }) => {
    const { resolveThreadManually } = await import("./support.server");
    return await resolveThreadManually(data.threadId);
  });
