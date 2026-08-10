"use client";

import { CheckCircle2 } from "lucide-react";
import {
  getEntryDraftDiffSummary,
  getEntryDraftPillClasses,
  isEntryCredited,
} from "@/features/planner/calendar-format";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import { getGoalVisual, type GoalVisual } from "@/features/planner/goal-visuals";

export interface PlannerEntryRowBaseEntry {
  key: string;
  originalGoalId: string;
  goalTitle: string | null;
  unitKey: string;
  label: string | null;
  classification: string;
  creditState: string;
  activeGoal: { color: string | null } | null;
  activeItem: { credited_completion_id: string | null } | null;
  draftDiffKind: "moved_from" | "moved_to" | "new" | null;
  draftDiffFromDate: string | null;
  draftDiffToDate: string | null;
  draftGhost: boolean;
}

export interface PlannerEntryRowState {
  visual: GoalVisual;
  credited: boolean;
  draftDiffSummary: string | null;
  pillToneClasses: string;
}

export function buildPlannerEntryRowState<TEntry extends PlannerEntryRowBaseEntry>(
  entry: TEntry,
  options: {
    creditedOverride?: boolean;
  } = {}
): PlannerEntryRowState {
  const plannerEntry = entry as unknown as PlannerDayDetailEntry;
  const visual = getGoalVisual({
    goalId: entry.originalGoalId,
    color: entry.activeGoal?.color ?? null,
  });
  const credited = options.creditedOverride ?? isEntryCredited(plannerEntry);
  return {
    visual,
    credited,
    draftDiffSummary: getEntryDraftDiffSummary(plannerEntry),
    pillToneClasses: getEntryDraftPillClasses({
      draftDiffKind: entry.draftDiffKind,
      credited,
    }),
  };
}

interface PlannerEntryRowProps<TEntry extends PlannerEntryRowBaseEntry> {
  entry: TEntry;
  rowState?: PlannerEntryRowState;
  displayTitle: string;
  subtitle?: string | null;
  variant: "compact" | "preview" | "detail";
  detailHintText?: string | null;
}

export function PlannerEntryRow<TEntry extends PlannerEntryRowBaseEntry>({
  entry,
  rowState,
  displayTitle,
  subtitle = null,
  variant,
  detailHintText = null,
}: PlannerEntryRowProps<TEntry>) {
  const state = rowState ?? buildPlannerEntryRowState(entry);
  const Icon = state.visual.Icon;

  if (variant === "compact") {
    return (
      <>
        <span
          className="inline-flex size-3 items-center justify-center rounded-full"
          style={{ backgroundColor: state.visual.color }}
        >
          <Icon className="size-2 text-white" />
        </span>
        <span className="truncate">{displayTitle}</span>
        {state.credited ? <CheckCircle2 className="size-2.5 shrink-0" /> : null}
      </>
    );
  }

  const iconSizeClassName = variant === "preview" ? "mt-0.5 size-4" : "size-5";
  const iconClassName = variant === "preview" ? "size-2.5" : "size-3";
  const metaTextClassName =
    variant === "preview" ? "truncate text-muted-foreground" : "mt-1 text-xs text-muted-foreground";

  return (
    <>
      <span
        className={`inline-flex items-center justify-center rounded-full ${iconSizeClassName}`}
        style={{ backgroundColor: state.visual.color }}
      >
        <Icon className={`${iconClassName} text-white`} />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">{displayTitle}</p>
        {state.draftDiffSummary ? (
          <p className={metaTextClassName}>{state.draftDiffSummary}</p>
        ) : null}
        {subtitle ? <p className={metaTextClassName}>{subtitle}</p> : null}
        {variant === "detail" && detailHintText ? (
          <p className="mt-1 text-xs text-primary">{detailHintText}</p>
        ) : null}
      </div>
    </>
  );
}
