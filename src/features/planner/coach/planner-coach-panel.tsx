"use client";

import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isCoachPolicyProposal } from "@/features/planner/coach/coach-message-state";
import type { PlannerCoachModel } from "@/features/planner/coach/coach-types";
import type { CoachGoalDraftMessageProposal } from "@/features/planner/calendar-surface.types";

interface PlannerCoachPanelProps {
  coach: PlannerCoachModel;
}

function formatSavedConversationDate(isoTimestamp: string) {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return format(parsed, "MMM d");
}

function formatProposalApplyStatus(status: string) {
  switch (status) {
    case "auto_applied":
      return "Auto-applied";
    case "manually_applied":
      return "Applied manually";
    case "undone":
      return "Undone";
    default:
      return "Ready to apply";
  }
}

function goalDraftErrorMessage(code?: string, fallback?: string) {
  switch (code) {
    case "quota_exceeded":
      return "The AI goal draft limit has been reached. Try again later or use Multi Goal.";
    case "rate_limited":
      return "Goal drafts are being generated too quickly. Wait a moment, then try again.";
    case "too_many_goals":
      return "The coach proposed more than five goals. Ask it to simplify the plan and send again.";
    default:
      return fallback ?? "Could not generate goal drafts.";
  }
}

function CoachGoalDraftProposal({
  coach,
  messageIndex,
  proposal,
}: {
  coach: PlannerCoachModel;
  messageIndex: number;
  proposal: CoachGoalDraftMessageProposal;
}) {
  const { state, actions } = coach;
  const draftState = state.coachGoalDraftStates[messageIndex];
  if (proposal.creationStatus === "created" || draftState?.status === "created") {
    return (
      <p className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
        Goals created. This action is not undoable here; edit or delete them from
        Goals.
      </p>
    );
  }
  if (!draftState) {
    return (
      <div className="mt-2 rounded border bg-background/70 p-2 text-xs">
        <p className="text-muted-foreground">
          Drafts are not generated yet. Generate editable drafts to review before
          creating goals.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => void actions.generateCoachGoalDrafts(messageIndex)}
        >
          Generate editable drafts
        </Button>
      </div>
    );
  }
  if (draftState.status === "loading") {
    return (
      <p className="mt-2 rounded border bg-background/70 p-2 text-xs text-muted-foreground">
        Generating editable goal drafts…
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {draftState.status === "error" ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            {goalDraftErrorMessage(
              draftState.errorCode,
              draftState.errorMessage
            )}
          </p>
          {draftState.errorCode !== "too_many_goals" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void actions.generateCoachGoalDrafts(messageIndex)}
            >
              Generate again
            </Button>
          ) : null}
        </div>
      ) : null}
      {draftState.drafts.length > 0 ? (
        <BulkGoalDraftReview
          variant="coach"
          drafts={draftState.drafts}
          setDrafts={(drafts) =>
            actions.setCoachGoalDrafts(messageIndex, drafts)
          }
          saving={draftState.status === "saving"}
          onCreate={() => actions.createCoachGoalDrafts(messageIndex)}
          warnings={draftState.warnings}
          createDisabledMessage={
            state.hasPendingCalendarEdits
              ? "Save or discard calendar edits first."
              : state.coachGoalRefreshStatus !== "idle"
                ? "Finish refreshing the calendar before creating more goals."
              : null
          }
        />
      ) : null}
    </div>
  );
}

export function PlannerCoachPanel({ coach }: PlannerCoachPanelProps) {
  const { state, actions } = coach;
  if (!state.canUseCoach) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-base font-semibold">AI Coach</h3>
        <Badge className="border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400 dark:bg-sky-900/40 dark:text-sky-100">
          Beta
        </Badge>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Ask for habit and training guidance based on your current monthly scope.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void actions.saveCoachConversation()}
          disabled={
            state.coachConversationSaving ||
            state.coachGoalRefreshStatus === "refreshing" ||
            state.coachMessages.length === 0
          }
        >
          {state.coachConversationSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={actions.startNewCoachConversation}
          disabled={
            state.coachLoading ||
            state.coachPolicyApplying ||
            state.coachGoalRefreshStatus === "refreshing" ||
            !state.hasCoachConversationState
          }
        >
          New convo
        </Button>
        <div className="relative min-w-0">
          <select
            value={state.selectedSavedCoachConversationId || ""}
            onChange={(event) => {
              const conversationId = event.target.value;
              if (!conversationId) {
                return;
              }
              actions.setSelectedSavedCoachConversationId(conversationId);
              void actions.restoreSavedCoachConversation(conversationId);
            }}
            disabled={
              state.coachConversationsLoading ||
              state.coachConversationRestoring ||
              state.coachGoalRefreshStatus === "refreshing"
            }
            aria-label="Saved conversations"
            className="h-8 w-[min(100%,16.25rem)] appearance-none rounded-lg border border-input bg-background/90 px-3 pr-8 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {state.coachConversationsLoading
                ? "Loading saved conversations..."
                : "Load convo"}
            </option>
            {state.savedCoachConversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title} ({formatSavedConversationDate(conversation.updatedAt)})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      {!state.coachConversationsLoading && state.savedCoachConversations.length === 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">
          No saved coach conversations yet.
        </p>
      ) : null}
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
        {state.coachMessages.length === 0 ? (
          <p className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-muted-foreground">
            Start with a goal question, for example: &quot;Help me build a 4-week
            running routine.&quot;
          </p>
        ) : (
          state.coachMessages.map((message, index) => (
            <div
              key={`${message.createdAt}-${index}`}
              className={`rounded-md p-2 text-sm ${
                message.role === "user" ? "bg-primary/10" : "bg-muted"
              }`}
            >
              <p className="mb-1 text-xs uppercase text-muted-foreground">
                {message.role === "user" ? "You" : "Coach"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" &&
              message.proposal &&
              isCoachPolicyProposal(message.proposal) ? (
                <div className="mt-2 rounded border bg-background/70 p-2">
                  <p className="text-xs font-medium text-foreground/90">
                    Proposal status:{" "}
                    {formatProposalApplyStatus(message.proposal.applyStatus)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {message.proposal.policyPatches.length} draft change
                    {message.proposal.policyPatches.length === 1 ? "" : "s"} available.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void actions.applyCoachProposal(index)}
                      disabled={state.coachPolicyApplying}
                    >
                      {state.coachPolicyApplying
                        ? "Applying..."
                        : message.proposal.applyStatus === "not_applied"
                          ? "Apply changes"
                          : "Re-apply changes"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void actions.undoCoachProposal(index)}
                      disabled={
                        state.coachPolicyApplying ||
                        message.proposal.baselinePolicy === null ||
                        (message.proposal.applyStatus !== "auto_applied" &&
                          message.proposal.applyStatus !== "manually_applied")
                      }
                    >
                      {state.coachPolicyApplying ? "Undoing..." : "Undo proposal"}
                    </Button>
                  </div>
                ) : null}
                {message.role === "assistant" &&
                message.proposal &&
                isCoachGoalDraftProposal(message.proposal) ? (
                  <CoachGoalDraftProposal
                    coach={coach}
                    messageIndex={index}
                    proposal={message.proposal}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="mt-3 space-y-2">
        {state.coachGoalRefreshStatus !== "idle" ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p>
              {state.coachGoalRefreshStatus === "refreshing"
                ? "Saving new goals and refreshing the calendar before the next coach turn…"
                : `Your goals were created, but the calendar still needs to refresh.${
                    state.coachGoalRefreshError
                      ? ` ${state.coachGoalRefreshError}`
                      : ""
                  }`}
            </p>
            {state.coachGoalRefreshStatus === "failed" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void actions.retryCoachGoalRefresh()}
              >
                Retry calendar refresh
              </Button>
            ) : null}
          </div>
        ) : null}
        <Textarea
          value={state.coachInput}
          onChange={(event) => actions.setCoachInput(event.target.value)}
          placeholder="Ask the coach for a specific plan..."
          rows={4}
          maxLength={4000}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={() => void actions.sendCoachMessage()}
            disabled={
              state.coachLoading ||
              state.coachGoalRefreshStatus !== "idle" ||
              state.coachInput.trim().length === 0
            }
          >
            {state.coachLoading ? "Thinking..." : "Send to coach"}
          </Button>
        </div>
      </div>
    </div>
  );
}
