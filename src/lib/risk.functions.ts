import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createPublicClient } from "./risk.server";
import type { RiskEvent, RiskRule } from "./risk";

const ruleInput = z.object({
  signal: z.string().trim().min(1).max(120),
  root_cause: z.string().trim().min(1).max(1000),
  category: z.enum(["customer_fixable", "bank_side", "merchant_side"]),
  recommended_action: z.string().trim().min(1).max(1000),
  urgency: z.enum(["low", "medium", "high"]),
});

export const listRules = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("risk_rules")
    .select("id, signal, root_cause, category, recommended_action, urgency")
    .order("signal", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RiskRule[];
});

export const listEvents = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, event_id, event_type, payload, event_created_at, received_at")
    .order("received_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as RiskEvent[];
});

export const createRule = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ruleInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: row, error } = await supabase
      .from("risk_rules")
      .insert(data)
      .select("id, signal, root_cause, category, recommended_action, urgency")
      .single();
    if (error) throw new Error(error.message);
    return row as RiskRule;
  });

export const updateRule = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ruleInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const supabase = createPublicClient();
    const { data: row, error } = await supabase
      .from("risk_rules")
      .update(fields)
      .eq("id", id)
      .select("id, signal, root_cause, category, recommended_action, urgency")
      .single();
    if (error) throw new Error(error.message);
    return row as RiskRule;
  });

export const deleteRule = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { error } = await supabase.from("risk_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
