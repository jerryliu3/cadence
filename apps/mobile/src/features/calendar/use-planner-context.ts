import { addDays, addMonths, endOfMonth, format, getDay, parse, startOfMonth } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface MobilePlannerWorkUnit {
  originalGoalId: string;
  unitKey: string;
  scheduledDate: string | null;
  label: string | null;
  classification: string;
  creditState: string;
  placementWindow?: { start: string; end: string } | null;
  draftMoveWindow?: { start: string; end: string } | null;
  creditWindow?: { start: string; end: string };
}

export interface MobilePlannerContext {
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goalTitles: Record<string, string>;
  capabilities?: {
    crossMonthMovesEnabled: boolean;
  };
  preview: {
    generationInputHash?: string;
    solver?: { publishable?: boolean; issueCodes?: string[] };
    workUnits: MobilePlannerWorkUnit[];
  } | null;
  activePlan: {
    plan: { id: string; version: number; status: string };
    items: Array<{
      id: string;
      unit_key: string;
      locked: boolean;
    }>;
  } | null;
  revisions: {
    scheduleDigest?: string | null;
  };
  preferences: {
    defaultPolicy: unknown;
  } | null;
}

function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

export function buildMonthCells(month: string, weekStartsOn = 1) {
  const monthStart = startOfMonth(parseMonth(month));
  const monthEnd = endOfMonth(monthStart);
  const startOffset = (getDay(monthStart) - weekStartsOn + 7) % 7;
  const gridStart = addDays(monthStart, -startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date: format(date, "yyyy-MM-dd"),
      inMonth: date >= monthStart && date <= monthEnd,
    };
  });
}

export function usePlannerContext(month: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["mobile-planner-context", month],
    enabled: Boolean(month),
    queryFn: () =>
      api.getJson<MobilePlannerContext>("/api/planner/context", {
        query: { scopeMonth: month ?? "" },
      }),
  });
  return {
    ...query,
    refresh: () =>
      queryClient.invalidateQueries({ queryKey: ["mobile-planner-context"] }),
  };
}

export function shiftMonth(month: string, delta: number) {
  return format(addMonths(parseMonth(month), delta), "yyyy-MM");
}
