import {
  ASSESSMENT_SCHEMA_VERSION,
  ELIGIBILITY_MODE,
  REQUIREMENT_SCHEMA_VERSION,
  SCHEDULER_VERSION,
} from "@/lib/planner/contracts/bounds";
import type { PlannerCapabilities } from "@/lib/planner/capabilities";
import { createOwnerPseudonym } from "@/lib/telemetry/pseudonym";
import {
  TELEMETRY_SCHEMA_VERSION,
  telemetryEventV1Schema,
  type TelemetryEventV1,
} from "@/lib/telemetry/schema";

interface TelemetryCommonInput {
  eventName: TelemetryEventV1["eventName"];
  ownerId: string;
  correlationId: string;
  capabilities: PlannerCapabilities;
  result: TelemetryEventV1["result"];
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  scope: { month: string; timezone: string } | null;
  counts?: TelemetryEventV1["counts"];
  replay?: boolean;
  versions?: Partial<TelemetryEventV1["versions"]>;
  data: TelemetryEventV1["data"];
}

const TELEMETRY_PREFIX = "[planner-telemetry]";

function resolveRuntimeEnvironment():
  | "development"
  | "test"
  | "preview"
  | "production" {
  if (process.env.NODE_ENV === "test") {
    return "test";
  }
  if (process.env.NODE_ENV === "development") {
    return "development";
  }
  if (process.env.VERCEL_ENV === "preview") {
    return "preview";
  }
  return "production";
}

function resolveTelemetrySigning() {
  const hmacKey = process.env.PLANNER_TELEMETRY_HMAC_KEY?.trim();
  const rawVersion = process.env.PLANNER_TELEMETRY_HMAC_KEY_VERSION?.trim() ?? "1";
  const parsedVersion = Number(rawVersion);
  if (!hmacKey) {
    return null;
  }
  if (!Number.isSafeInteger(parsedVersion) || parsedVersion < 1) {
    return null;
  }
  return {
    hmacKey,
    keyVersion: parsedVersion,
  };
}

function resolveCohort() {
  const configured = process.env.CALENDAR_TELEMETRY_COHORT?.trim();
  if (!configured) {
    return "internal";
  }
  return configured.slice(0, 100);
}

function normalizeDurationMs(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(900_000, Math.round(value)));
}

export function classifyTelemetryResult({
  statusCode,
  errorCode,
  allowPartial = false,
}: {
  statusCode: number;
  errorCode: string | null;
  allowPartial?: boolean;
}): TelemetryEventV1["result"] {
  if (statusCode >= 200 && statusCode < 300) {
    if (allowPartial && errorCode === "partial") {
      return "partial";
    }
    return "success";
  }
  if (statusCode === 409) {
    return "conflict";
  }
  if (statusCode === 429) {
    return "quota_rejected";
  }
  if (
    statusCode === 404 ||
    statusCode === 503 ||
    (errorCode !== null && errorCode.includes("disabled"))
  ) {
    return "disabled";
  }
  return "error";
}

export function emitTelemetryEvent(input: TelemetryCommonInput) {
  const signing = resolveTelemetrySigning();
  if (!signing) {
    return;
  }

  try {
    const environment = resolveRuntimeEnvironment();
    const owner = createOwnerPseudonym({
      ownerId: input.ownerId,
      environment,
      hmacKey: signing.hmacKey,
      keyVersion: signing.keyVersion,
    });
    const event = telemetryEventV1Schema.parse({
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventName: input.eventName,
      timestamp: new Date().toISOString(),
      correlationId: input.correlationId,
      environment,
      ownerPseudonym: owner.ownerPseudonym,
      ownerPseudonymKeyVersion: owner.ownerPseudonymKeyVersion,
      cohort: resolveCohort(),
      scope: input.scope,
      versions: {
        telemetrySchema: TELEMETRY_SCHEMA_VERSION,
        eligibilityMode: input.scope ? ELIGIBILITY_MODE : null,
        scheduler: input.scope ? SCHEDULER_VERSION : null,
        requirementSchema: REQUIREMENT_SCHEMA_VERSION,
        assessmentSchema: input.scope ? ASSESSMENT_SCHEMA_VERSION : null,
        prompt: null,
        ...input.versions,
      },
      result: input.result,
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      durationMs: normalizeDurationMs(input.durationMs),
      counts: input.counts ?? {},
      replay: input.replay ?? false,
      flags: {
        plannerRead: input.capabilities.plannerRead,
        plannerGeneration: input.capabilities.plannerGeneration,
        plannerPlanWrites: input.capabilities.plannerPlanWrites,
        targetedExactCompletion: input.capabilities.targetedExactCompletion,
        coachAi: input.capabilities.coachAi,
        overlap: input.capabilities.overlap,
      },
      data: input.data,
    });
    console.info(TELEMETRY_PREFIX, JSON.stringify(event));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    console.warn(`${TELEMETRY_PREFIX} dropped`, reason);
  }
}
