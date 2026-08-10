// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

/**
 * Preview and save both run the kernel, and save rejects the publish when its
 * hash does not match the preview's. Every route test mocks `runPlannerKernel`,
 * so nothing checked that the two routes feed it the *same* inputs -- and they
 * did not: `preserveExistingAssignments` was set three different ways, so an
 * ordinary drag-then-save produced two different hashes and a 409.
 *
 * These run the real kernel through both handlers against one snapshot.
 */
const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  loadPlannerCanonicalSnapshot: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: vi.fn() } }),
}));

vi.mock("@/lib/planner/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/api")>(
      "@/lib/planner/api"
    );
  return {
    ...actual,
    createCorrelationId: () => "test-correlation-id",
    parseBoundedJsonBody: mocks.parseBoundedJsonBody,
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    resolveCanonicalAsOfDate: mocks.resolveCanonicalAsOfDate,
  };
});

vi.mock("@/lib/planner/context-loader", () => ({
  loadPlannerCanonicalSnapshot: mocks.loadPlannerCanonicalSnapshot,
}));

import { POST as previewPost } from "./context/route";
import { POST as savePost } from "./save/route";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "10000000-0000-4000-8000-000000000001";
const SCOPE_MONTH = "2026-08";
const AS_OF_DATE = "2026-08-01";

const goal: Goal = {
  id: GOAL_ID,
  owner_id: OWNER_ID,
  title: "Practice presentation",
  description: null,
  category: "Personal",
  color: null,
  frequency_type: "recurring",
  recurrence_interval: "daily",
  target_count: 6,
  milestone_names: null,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  photo_path: null,
  is_group: false,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

function moveCommand(unitKey: string, scheduledDate: string) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    kind: "move_item" as const,
    goalId: GOAL_ID,
    unitKey,
    scheduledDate,
  };
}

async function runPreview(draftCommands: ReturnType<typeof moveCommand>[]) {
  mocks.parseBoundedJsonBody.mockResolvedValueOnce({
    scopeMonth: SCOPE_MONTH,
    timezone: "UTC",
    source: "manual",
    policy,
    solveIntent: "stable",
    draftCommands,
  });
  const response = await previewPost(
    new Request("http://localhost/api/planner/context", { method: "POST" })
  );
  return { response, body: await response.json() };
}

async function runSave({
  previewHash,
  draftCommands,
  preserveExistingAssignments,
}: {
  previewHash: string;
  draftCommands: ReturnType<typeof moveCommand>[];
  preserveExistingAssignments: boolean;
}) {
  mocks.parseBoundedJsonBody.mockResolvedValueOnce({
    scopeMonth: SCOPE_MONTH,
    previewHash,
    expectedDigest: "a".repeat(64),
    eligibilityMode: "overlap_v1",
    preserveExistingAssignments,
    draftCommands,
  });
  const response = await savePost(
    new Request("http://localhost/api/planner/save", { method: "POST" })
  );
  return { response, body: await response.json() };
}

describe("preview and save agree on kernel inputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: OWNER_ID,
      supabase: { rpc: mocks.rpc },
      capabilities: { calendarEnabled: true },
    });
    mocks.resolveCanonicalAsOfDate.mockReturnValue(AS_OF_DATE);
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValue({
      goals: [goal],
      completions: [],
      links: [],
      revisions: { canonicalRevision: 0, executionRevision: 0 },
      preferences: { timezone: "UTC", default_policy: policy },
      activePlan: null,
    });
    // Publishing itself is out of scope here; reaching the RPC means the hash
    // check passed, which is what these assert.
    mocks.rpc.mockResolvedValue({
      data: [{ schedule_digest: "b".repeat(64), upserted_count: 6 }],
      error: null,
    });
  });

  it("saves a clean preview without a stale-hash rejection", async () => {
    const preview = await runPreview([]);
    expect(preview.response.status).toBe(200);

    const save = await runSave({
      previewHash: preview.body.preview.generationInputHash,
      draftCommands: [],
      preserveExistingAssignments:
        preview.body.preview.preserveExistingAssignments,
    });

    expect(save.body.code).not.toBe("preview_hash_mismatch");
    expect(mocks.rpc).toHaveBeenCalled();
  });

  it("saves a dragged preview without a stale-hash rejection", async () => {
    // The regression: a drag with no policy override. Preview solved with
    // `preserveExistingAssignments: false`, save inferred `true` from the
    // absent policy, and the hashes could never match.
    const baseline = await runPreview([]);
    const firstUnitKey = baseline.body.preview.workUnits[0].unitKey;
    const draftCommands = [moveCommand(firstUnitKey, "2026-08-20")];

    const dragged = await runPreview(draftCommands);
    expect(dragged.response.status).toBe(200);
    expect(
      dragged.body.preview.workUnits.find(
        (unit: { unitKey: string }) => unit.unitKey === firstUnitKey
      ).scheduledDate
    ).toBe("2026-08-20");

    const save = await runSave({
      previewHash: dragged.body.preview.generationInputHash,
      draftCommands,
      preserveExistingAssignments:
        dragged.body.preview.preserveExistingAssignments,
    });

    expect(save.body.code).not.toBe("preview_hash_mismatch");
    expect(mocks.rpc).toHaveBeenCalled();
  });

  it("still rejects a hash that does not describe the submitted state", async () => {
    const preview = await runPreview([]);

    const save = await runSave({
      previewHash: preview.body.preview.generationInputHash,
      draftCommands: [moveCommand("total:1", "2026-08-20")],
      preserveExistingAssignments:
        preview.body.preview.preserveExistingAssignments,
    });

    expect(save.response.status).toBe(409);
    expect(save.body.code).toBe("preview_hash_mismatch");
  });
});
