import { callAdminRpc } from "@/lib/supabase/admin-rpc";
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

export async function syncPlannerItemsFromActiveExecutionPlan({
  admin,
  ownerId,
  correlationId,
  scopeMonth,
  source,
}: {
  admin: AdminClient;
  ownerId: string;
  correlationId: string;
  scopeMonth?: string;
  source: "planner-publish" | "planner-lock" | "planner-move" | "planner-dismiss" | "planner-schedule";
}): Promise<PlannerItemsSyncResult> {
  try {
    const response = await callAdminRpc(
      admin,
      "sync_planner_items_from_active_execution_plan_service",
      {
        p_owner: ownerId,
      }
    );
    if (response.error) {
      console.error(`[${source}] planner_items mirror sync failed`, {
        correlationId,
        scopeMonth,
        cause: response.error.message,
      });
      return {
        scheduleDigest: null,
        syncedCount: 0,
      };
    }
    return parsePlannerItemsSyncResult(response.data);
  } catch (error) {
    console.error(`[${source}] planner_items mirror sync failed`, {
      correlationId,
      scopeMonth,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      scheduleDigest: null,
      syncedCount: 0,
    };
  }
}
