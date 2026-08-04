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
  materializeWorstCasePlannerInput,
  serializeCompactWorstCasePlan,
} from "./worst-case";

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
    const input = materializeWorstCasePlannerInput();
    const compactPlan = serializeCompactWorstCasePlan(input);
    const byteLength = new TextEncoder().encode(compactPlan).byteLength;

    expect(byteLength).toBeLessThan(MAX_API_BODY_BYTES);
  });

  it("keeps fixture setup p95 below the future solver budget", () => {
    const durations = Array.from({ length: 7 }, () => {
      const startedAt = performance.now();
      materializeWorstCasePlannerInput();
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);
    const p95Index = Math.ceil(durations.length * 0.95) - 1;

    expect(durations[p95Index]).toBeLessThan(2_000);
  });
});
