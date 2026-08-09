"use client";

import { useCallback } from "react";
import {
  executeCompletionDispatch,
  type CompletionDispatchDecision,
  type PlannerGoalDateFactExpectation,
  type PlannerItemDateFactExpectation,
} from "@/lib/planner/completion-dispatch";

export interface RunCompletionMutationInput {
  decision: CompletionDispatchDecision;
  desiredFactState: "present" | "absent";
  goalId: string;
  date: string;
  timezone: string;
  plannerItemExpectation?: PlannerItemDateFactExpectation;
  plannerGoalExpectation?: PlannerGoalDateFactExpectation;
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
