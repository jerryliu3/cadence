import { z } from "zod";
import {
  HEALTH_METRIC_KEYS,
  HEALTH_PROVIDERS,
} from "@cadence/shared/health/providers";
import { isHealthLocalTodayInEnvelope } from "@cadence/shared/health/sync-window";
import type { Json } from "@cadence/shared/supabase/database.types";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { reportHealthDiagnostic } from "@/lib/health/diagnostics";
import {
  requireIntegrationsAccess,
  requireIntegrationsFlag,
} from "@/lib/health/integrations-disabled";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 512 * 1024;
const LOCAL_TODAY = /^\d{4}-\d{2}-\d{2}$/;

const sampleSchema = z.object({
  providerNativeId: z.string().trim().min(1).max(256),
  sourceIdentifier: z.string().trim().min(1).max(256),
  sourceName: z.string().trim().max(256).optional(),
  metricKey: z.enum(HEALTH_METRIC_KEYS),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).optional(),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
  valueNumeric: z.number().nonnegative(),
  unit: z.string().trim().min(1).max(32),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const ingestSchema = z.object({
  provider: z.enum(HEALTH_PROVIDERS),
  permissionPrompted: z.boolean().optional(),
  localToday: z.string().regex(LOCAL_TODAY).optional(),
  lastError: z.string().trim().max(500).nullable().optional(),
  samples: z.array(sampleSchema).max(500),
  deletedNativeIds: z.array(z.string().trim().min(1).max(256)).max(500).optional(),
});

function asJsonObject(value: Record<string, unknown> | undefined): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    requireIntegrationsFlag();

    const payload = await parseJsonBody({
      request,
      schema: ingestSchema,
      maxBytes: MAX_REQUEST_BYTES,
    });
    const { userId, supabase } = await requireAuthenticatedRequestContext(
      request,
      { unauthorizedMessage: "Sign in to sync health data." }
    );
    requireIntegrationsAccess(userId);

    if (
      payload.localToday !== undefined &&
      !isHealthLocalTodayInEnvelope(payload.localToday)
    ) {
      throw new ApiRouteError(
        400,
        "local_today_out_of_range",
        "localToday must be a real calendar day within the UTC offset envelope."
      );
    }

    let ingestResult: {
      ingested_count?: number;
      skipped_count?: number;
      deleted_count?: number;
      canonical_count?: number;
      suppressed_count?: number;
      recomputed_days?: number;
    } = {
      ingested_count: 0,
      skipped_count: 0,
      deleted_count: 0,
      canonical_count: 0,
      suppressed_count: 0,
      recomputed_days: 0,
    };
    let autocompleteResult = {
      applied_count: 0,
      skipped_count: 0,
    };

    const deletedNativeIds = payload.deletedNativeIds ?? [];
    if (payload.samples.length > 0 || deletedNativeIds.length > 0) {
      const rpcResponse = await supabase.rpc("ingest_health_activities_service", {
        p_samples: payload.samples.map((sample) => ({
          provider: payload.provider,
          provider_native_id: sample.providerNativeId,
          source_identifier: sample.sourceIdentifier,
          source_name: sample.sourceName ?? null,
          metric_key: sample.metricKey,
          started_at: sample.startedAt,
          ended_at: sample.endedAt ?? null,
          utc_offset_minutes: sample.utcOffsetMinutes,
          value_numeric: sample.valueNumeric,
          unit: sample.unit,
          payload: asJsonObject(sample.payload),
        })),
        p_deleted_native_ids: deletedNativeIds.map((providerNativeId) => ({
          provider: payload.provider,
          provider_native_id: providerNativeId,
        })),
      });
      if (rpcResponse.error) {
        throw new ApiRouteError(
          500,
          "health_ingest_failed",
          "Health samples could not be ingested."
        );
      }
      ingestResult = (rpcResponse.data ?? ingestResult) as typeof ingestResult;
    }

    if (payload.localToday && payload.lastError == null) {
      const autocompleteResponse = await supabase.rpc(
        "apply_health_autocomplete_service",
        { p_local_today: payload.localToday }
      );
      if (autocompleteResponse.error) {
        throw new ApiRouteError(
          500,
          "health_autocomplete_failed",
          "Health auto-complete could not be applied."
        );
      }
      autocompleteResult = (autocompleteResponse.data ??
        autocompleteResult) as typeof autocompleteResult;
    }

    const now = new Date().toISOString();
    const admin = createAdminClient();
    const syncRow: {
      user_id: string;
      provider: (typeof payload)["provider"];
      last_ingest_at: string;
      last_error: string | null;
      permission_prompted_at?: string;
      last_sample_at?: string;
    } = {
      user_id: userId,
      provider: payload.provider,
      last_ingest_at: now,
      last_error: payload.lastError ?? null,
    };
    if (payload.permissionPrompted) {
      syncRow.permission_prompted_at = now;
    }
    if (payload.samples.length > 0) {
      syncRow.last_sample_at = now;
    }
    const upsertResponse = await admin.from("health_sync_state").upsert(syncRow, {
      onConflict: "user_id,provider",
    });
    if (upsertResponse.error) {
      throw new ApiRouteError(
        500,
        "health_ingest_failed",
        "Health samples could not be ingested."
      );
    }

    reportHealthDiagnostic({
      event: payload.lastError ? "sync_failure" : "ingest",
      correlationId,
      provider: payload.provider,
      ingestedCount: ingestResult.ingested_count ?? payload.samples.length,
      canonicalCount: ingestResult.canonical_count ?? 0,
      suppressedCount: ingestResult.suppressed_count ?? 0,
      autocompleteAppliedCount: autocompleteResult.applied_count ?? 0,
      lastError: payload.lastError,
    });

    return apiSuccessResponse(
      {
        schemaVersion: "1" as const,
        provider: payload.provider,
        ingestedCount: ingestResult.ingested_count ?? payload.samples.length,
        skippedCount: ingestResult.skipped_count ?? 0,
        deletedCount: ingestResult.deleted_count ?? deletedNativeIds.length,
        canonicalCount: ingestResult.canonical_count ?? 0,
        suppressedCount: ingestResult.suppressed_count ?? 0,
        autocompleteAppliedCount: autocompleteResult.applied_count ?? 0,
        autocompleteSkippedCount: autocompleteResult.skipped_count ?? 0,
      },
      correlationId
    );
  });
}
