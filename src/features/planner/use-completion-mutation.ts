"use client";

import { useCallback } from "react";
import {
  executeCompletionDispatch,
  type CompletionDispatchDecision,
  type PlannerGoalDateFactExpectation,
  type PlannerItemDateFactExpectation,
} from "@/lib/planner/completion-dispatch";
import {
  requestXpRefresh,
  type ViewportRectSnapshot,
} from "@/lib/xp/events";

export interface RunCompletionMutationInput {
  decision: CompletionDispatchDecision;
  desiredFactState: "present" | "absent";
  goalId: string;
  date: string;
  timezone: string;
  plannerItemExpectation?: PlannerItemDateFactExpectation;
  plannerGoalExpectation?: PlannerGoalDateFactExpectation;
  sourceRect?: ViewportRectSnapshot;
  blockedMessage?: string;
  fallbackErrorMessage: string;
}

export interface RunCompletionMutationResult {
  ok: boolean;
  message: string | null;
}

export function useCompletionMutation() {
  return useCallback(
    async ({
      decision,
      desiredFactState,
      goalId,
      date,
      timezone,
      plannerItemExpectation,
      plannerGoalExpectation,
      sourceRect,
      blockedMessage,
      fallbackErrorMessage,
    }: RunCompletionMutationInput): Promise<RunCompletionMutationResult> => {
      if (!decision.allowed) {
        return {
          ok: false,
          message:
            blockedMessage ??
            (decision.reason === "future_creation"
              ? "You can only mark completions for today or a past date."
              : "This completion cannot be changed from this date."),
        };
      }

      try {
        const result = await executeCompletionDispatch({
          decision,
          desiredFactState,
          goalId,
          date,
          timezone,
          plannerItemExpectation,
          plannerGoalExpectation,
        });
        if (!result.ok) {
          return {
            ok: false,
            message: result.message ?? fallbackErrorMessage,
          };
        }
        requestXpRefresh({
          reason: "completion",
          desiredFactState,
          sourceRect,
        });
        return {
          ok: true,
          message: null,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : fallbackErrorMessage,
        };
      }
    },
    []
  );
}
