// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_API_BODY_BYTES,
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
  MAX_POLICY_RANGES,
  MAX_WORK_UNITS,
} from "../contracts/bounds";
import {
  materializeWorstCaseKernelInput,
  materializeWorstCasePlannerInput,
  serializeCompactPlannerOutput,
} from "./worst-case";
import { runPlannerKernel } from "@/lib/planner/kernel";
import { canonicalHash } from "@/lib/planner/canonical";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("worst-case planner benchmark fixture", () => {
  it("materializes every supported input bound deterministically", () => {
    const first = materializeWorstCasePlannerInput();
    const second = materializeWorstCasePlannerInput();

    expect(first.goals).toHaveLength(MAX_ELIGIBLE_GOALS);
    expect(first.workUnits).toHaveLength(MAX_WORK_UNITS);
    expect(first.completionFacts).toHaveLength(MAX_COMPLETION_FACTS);
    expect(first.policyRanges).toHaveLength(MAX_POLICY_RANGES);
    expect(digest(JSON.stringify(first))).toBe(digest(JSON.stringify(second)));
  });

  it("keeps the compact worst-case plan response under 3 MB", () => {
    const output = runPlannerKernel(
      materializeWorstCaseKernelInput({
        withBasePlan: true,
        replaceLineage: true,
      })
    );
    const compactPlan = serializeCompactPlannerOutput(output);
    const byteLength = new TextEncoder().encode(compactPlan).byteLength;

    expect(byteLength).toBeLessThan(MAX_API_BODY_BYTES);
  });

  it(
    "returns the same full kernel result for the same bounded input",
    () => {
    const first = runPlannerKernel(materializeWorstCaseKernelInput());
    const second = runPlannerKernel(materializeWorstCaseKernelInput());

    expect(canonicalHash(first)).toBe(canonicalHash(second));
    },
    20_000
  );
});
