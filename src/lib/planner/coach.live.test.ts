// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { applyCoachPolicyPatches } from "@/features/planner/coach-policy";
import { generateGeminiJson } from "@/lib/ai/gemini";
import {
  coachResponseJsonSchema,
  sanitizeCoachTurn,
} from "@/lib/planner/coach";
import { buildCoachPrompt } from "@/lib/planner/coach-prompt";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

const RUN_LIVE_TESTS = process.env.RUN_LIVE_COACH_TESTS === "true";
const GOAL_ID = "12000000-0000-4000-8000-000000000001";

const runningGoal: Goal = {
  id: GOAL_ID,
  owner_id: "11111111-1111-4111-8111-111111111111",
  title: "Run 30 miles per week",
  description: "Maintain a safe four-week running routine.",
  category: "Health",
  color: null,
  frequency_type: "recurring",
  recurrence_interval: "weekly",
  target_count: 30,
  milestone_names: null,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  photo_path: null,
  team_id: null,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe.skipIf(!RUN_LIVE_TESTS)("live Gemini coach integration", () => {
  it(
    "generates, compiles, and applies calendar intent",
    async () => {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY is required for the manual live coach test."
        );
      }

      const prompt = buildCoachPrompt({
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        timezone: "America/New_York",
        asOfDate: "2026-08-05",
        allGoalsCount: 1,
        sessionRoster: [],
        focusGoals: [runningGoal],
        deterministicSummary:
          "The running goal has no existing weekday restrictions or date preferences.",
        messages: [
          {
            role: "user",
            content:
              "Schedule my existing 'Run 30 miles per week' goal on Tuesday, Thursday, and Sunday. Sunday is the long run. Use even spacing, make safe assumptions, and do not ask follow-up questions. Return apply-able calendar intent.",
          },
        ],
      });

      const generated = await generateGeminiJson({
        prompt,
        responseSchema:
          coachResponseJsonSchema as unknown as Record<string, unknown>,
        apiKey,
        model:
          process.env.GEMINI_LIVE_TEST_MODEL?.trim() ||
          process.env.GEMINI_MODEL?.trim(),
        modelFallbacks: [],
        maxAttempts: 1,
        maxOutputTokens: 1_500,
        totalTimeoutMs: 60_000,
      });

      const sanitized = sanitizeCoachTurn({
        raw: generated.candidateJson,
        goalsById: new Map([[runningGoal.id, runningGoal]]),
      });

      expect(sanitized.warnings).toEqual([]);
      expect(sanitized.proposal.unresolvedQuestions).toEqual([]);
      expect(
        sanitized.proposal.policyPatches.some(
          (patch) =>
            patch.kind === "set_rest_weekdays" ||
            patch.kind === "add_blackout_range" ||
            patch.kind === "remove_blackout_range"
        )
      ).toBe(true);

      const applied = applyCoachPolicyPatches({
        policy: createDefaultPlannerPolicy(
          "America/New_York",
          "2026-08-01T00:00:00.000Z"
        ),
        patches: sanitized.proposal.policyPatches,
      });

      expect(applied.unsupportedPatchCount).toBe(0);
      expect(applied.appliedPatchCount + applied.ignoredPatchCount).toBeGreaterThan(0);
    },
    75_000
  );
});
