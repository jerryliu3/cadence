import { PlannerRouteError } from "@/lib/planner/api";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface PlannerItemsSyncResult {
  scheduleDigest: string | null;
  syncedCount: number;
}

interface PlannerItemsSyncRow {
  schedule_digest?: unknown;
  synced_count?: unknown;
}

function parsePlannerItemsSyncResult(data: unknown): PlannerItemsSyncResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return {
      scheduleDigest: null,
      syncedCount: 0,
    };
  }
  const typedRow = row as PlannerItemsSyncRow;
  return {
    scheduleDigest:
      typeof typedRow.schedule_digest === "string"
        ? typedRow.schedule_digest
        : null,
    syncedCount:
      typeof typedRow.synced_count === "number" &&
      Number.isFinite(typedRow.synced_count)
        ? typedRow.synced_count
        : 0,
  };
}

export function scopeMonthDate(scopeMonth: string) {
  return `${scopeMonth}-01`;
}

export function scopeMonthFromDate(value: string) {
  return value.slice(0, 7);
}

export async function syncPlannerItemsFromActiveExecutionPlan({
  admin,
  ownerId,
  scopeMonth,
}: {
  admin: AdminClient;
  ownerId: string;
  scopeMonth: string;
}): Promise<PlannerItemsSyncResult> {
  const rpc = (admin as unknown as {
    rpc: (
      functionName: string,
      params: Record<string, unknown>
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  }).rpc.bind(admin);

  const response = await rpc(
    "sync_planner_items_from_active_execution_plan_service",
    {
      p_owner: ownerId,
      p_scope_month: scopeMonthDate(scopeMonth),
    }
  );

  if (response.error) {
    throw new PlannerRouteError(
      500,
      "planner_items_sync_failed",
      "Planner schedule mirror could not be updated.",
      { cause: response.error.message, scopeMonth }
    );
  }

  return parsePlannerItemsSyncResult(response.data);
}
