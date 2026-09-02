import { queryOptions } from "@tanstack/react-query";

import {
  getRecoverySummary,
  listAgentActions,
  listBusinessAlerts,
} from "./agent.functions";

export const agentActionsQueryOptions = queryOptions({
  queryKey: ["agent_actions"],
  queryFn: () => listAgentActions(),
});

export const businessAlertsQueryOptions = queryOptions({
  queryKey: ["business_alerts"],
  queryFn: () => listBusinessAlerts(),
});

export const recoverySummaryQueryOptions = queryOptions({
  queryKey: ["recovery_summary"],
  queryFn: () => getRecoverySummary(),
});
