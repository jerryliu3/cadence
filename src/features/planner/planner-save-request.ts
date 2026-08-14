import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import type { PlannerContextPayload } from "./calendar-surface.types";

type PlannerSavePreview = NonNullable<PlannerContextPayload["preview"]>;

export interface PlannerSaveWindow {
  start: string;
  end: string;
}

interface BuildPlannerSaveRequestInput {
  expectedDigest: string;
  saveWindow: PlannerSaveWindow;
  preview: PlannerSavePreview;
  policy: PlannerPolicy | null;
  draftCommands: PlannerDraftCommand[];
}

/**
 * Single source for the kernel-validated save body. The hash, eligibility mode,
 * and `preserveExistingAssignments` must all come from the same preview the
 * user looked at, or publish solves different inputs than the draft did and
 * fails on either the preview hash or a draft pin collision.
 */
export function buildPlannerSaveRequestBody({
  expectedDigest,
  saveWindow,
  preview,
  policy,
  draftCommands,
}: BuildPlannerSaveRequestInput) {
  const confirmationHash = preview.solver.confirmationRequired
    ? buildPlannerConfirmationHash({
        previewHash: preview.generationInputHash,
        issueCodes: preview.solver.issueCodes,
      })
    : null;

  return {
    expectedDigest,
    startDate: saveWindow.start,
    endDate: saveWindow.end,
    previewHash: preview.generationInputHash,
    eligibilityMode: preview.eligibilityMode,
    confirmationHash,
    policy: policy ?? undefined,
    preserveExistingAssignments: preview.preserveExistingAssignments,
    draftCommands,
  };
}
