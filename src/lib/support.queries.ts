import { queryOptions } from "@tanstack/react-query";

import { listSupportThreads } from "./support.functions";

export const supportThreadsQueryOptions = queryOptions({
  queryKey: ["support_threads"],
  queryFn: () => listSupportThreads(),
});
