import { describe, expect, it } from "vitest";
import { buildPlannerSaveRequestBody } from "@/features/planner/planner-save-request";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";

type Preview = NonNullable<PlannerContextPayload["preview"]>;

function preview(overrides: Partial<Preview> = {}): Preview {
  return {
    eligibilityMode: "strict_v1",
    preserveExistingAssignments: true,
    generationInputHash: "a".repeat(64),
    solver: {
      placementStatus: "complete",
      searchStatus: "all_units_placed",
      capacityStatus: "unverified",
      issueCodes: [],
      invalidGoalIds: [],
      publishable: true,
      confirmationRequired: false,
    },
    workUnits: [],
    ...overrides,
  } as Preview;
}

const WINDOW = { start: "2026-08-01", end: "2026-08-31" };

describe("buildPlannerSaveRequestBody", () => {
  it("carries the preview's hash, eligibility mode, and preservation flag", () => {
    const body = buildPlannerSaveRequestBody({
      expectedDigest: "digest-1",
      saveWindow: WINDOW,
      preview: preview(),
      policy: null,
      draftCommands: [],
    });

    expect(body).toMatchObject({
      expectedDigest: "digest-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      previewHash: "a".repeat(64),
      eligibilityMode: "strict_v1",
      preserveExistingAssignments: true,
    });
  });

  it("sends the draft policy so mixed saves solve the inputs the preview used", () => {
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
    const body = buildPlannerSaveRequestBody({
      expectedDigest: "digest-1",
      saveWindow: WINDOW,
      preview: preview(),
      policy,
      draftCommands: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          sequence: 1,
          kind: "move_item",
          goalId: "11111111-1111-4111-8111-111111111111",
          unitKey: "milestone:1",
          scheduledDate: "2026-08-20",
          sourceDate: "2026-08-12",
        },
      ],
    });

    expect(body.policy).toEqual(policy);
    expect(body.draftCommands).toHaveLength(1);
  });

  it("omits policy entirely when the draft has none", () => {
    const body = buildPlannerSaveRequestBody({
      expectedDigest: "digest-1",
      saveWindow: WINDOW,
      preview: preview(),
      policy: null,
      draftCommands: [],
    });

    expect(body.policy).toBeUndefined();
  });

  it("derives the confirmation hash from the same preview when confirmation is required", () => {
    const confirming = preview({
      solver: {
        ...preview().solver,
        publishable: true,
        confirmationRequired: true,
        issueCodes: ["placement_shortfall"],
      },
    });

    const body = buildPlannerSaveRequestBody({
      expectedDigest: "digest-1",
      saveWindow: WINDOW,
      preview: confirming,
      policy: null,
      draftCommands: [],
    });

    expect(body.confirmationHash).toBe(
      buildPlannerConfirmationHash({
        previewHash: confirming.generationInputHash,
        issueCodes: ["placement_shortfall"],
      })
    );
  });

  it("sends a null confirmation hash when confirmation is not required", () => {
    const body = buildPlannerSaveRequestBody({
      expectedDigest: "digest-1",
      saveWindow: WINDOW,
      preview: preview(),
      policy: null,
      draftCommands: [],
    });

    expect(body.confirmationHash).toBeNull();
  });

  it("propagates a preview that did not preserve existing assignments", () => {
    const body = buildPlannerSaveRequestBody({
      expectedDigest: "digest-1",
      saveWindow: WINDOW,
      preview: preview({ preserveExistingAssignments: false }),
      policy: null,
      draftCommands: [],
    });

    expect(body.preserveExistingAssignments).toBe(false);
  });
});
