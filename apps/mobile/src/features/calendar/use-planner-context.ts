import { addMonths, format, parse } from "date-fns";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PlannerContextPayload,
  PlannerWorkUnit,
} from "@cadence/shared/planner/context";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { createMobilePlannerContextLoader } from "./planner-context-loader";

export type MobilePlannerContext = PlannerContextPayload;
export type MobilePlannerWorkUnit = PlannerWorkUnit;

function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

export function usePlannerContext(month: string | null) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const loaderRef = useRef<ReturnType<
    typeof createMobilePlannerContextLoader
  > | null>(null);
  if (loaderRef.current == null) {
    loaderRef.current = createMobilePlannerContextLoader({
      postJson: (path, body) =>
        api.postJson<MobilePlannerContext>(path, body),
      getJson: (path, options) =>
        api.getJson<MobilePlannerContext>(path, options),
    });
  }
  useEffect(() => {
    loaderRef.current?.reset();
  }, [userId]);
  const queryKey = ["mobile-planner-context", userId, month] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(month) && Boolean(userId),
    queryFn: () => loaderRef.current!.load(month ?? ""),
  });
  return {
    ...query,
    refresh: () =>
      queryClient.invalidateQueries({
        queryKey: ["mobile-planner-context", userId],
      }),
    forcePrepare: async () => {
      if (!month || !userId) {
        return undefined;
      }
      const context = await loaderRef.current!.forcePrepare(month);
      queryClient.setQueryData(queryKey, context);
      return context;
    },
  };
}

export function shiftMonth(month: string, delta: number) {
  return format(addMonths(parseMonth(month), delta), "yyyy-MM");
}
