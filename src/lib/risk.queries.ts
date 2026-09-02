import { queryOptions } from "@tanstack/react-query";

import { listEvents, listRules } from "./risk.functions";

export const rulesQueryOptions = queryOptions({
  queryKey: ["risk_rules"],
  queryFn: () => listRules(),
});

export const eventsQueryOptions = queryOptions({
  queryKey: ["events"],
  queryFn: () => listEvents(),
});
