"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PlannerCoachModel } from "@/features/planner/coach/coach-types";

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

export function PlannerCoachPanel({ coach }: PlannerCoachPanelProps) {
  const { state, actions } = coach;
  if (!state.canUseCoach) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-base font-semibold">AI Coach</h3>
        <Badge variant="outline">Experimental</Badge>
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
          disabled={state.coachConversationSaving || state.coachMessages.length === 0}
        >
          {state.coachConversationSaving ? "Saving..." : "Save conversation"}
        </Button>
        <Select
          value={state.selectedSavedCoachConversationId || undefined}
          onValueChange={actions.setSelectedSavedCoachConversationId}
        >
          <SelectTrigger className="h-8 w-[260px]">
            <SelectValue
              placeholder={
                state.coachConversationsLoading
                  ? "Loading saved conversations..."
                  : "Select saved conversation"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {state.savedCoachConversations.map((conversation) => (
              <SelectItem key={conversation.id} value={conversation.id}>
                {conversation.title} ({formatSavedConversationDate(conversation.updatedAt)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void actions.restoreSavedCoachConversation(
              state.selectedSavedCoachConversationId
            )
          }
          disabled={
            state.coachConversationsLoading ||
            state.coachConversationRestoring ||
            !state.selectedSavedCoachConversationId
          }
        >
          {state.coachConversationRestoring ? "Restoring..." : "Restore"}
        </Button>
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
            </div>
          ))
        )}
      </div>
      {state.coachRecommendations.length > 0 ? (
        <div className="mt-3 rounded-md border border-dashed p-2 text-sm">
          <p className="mb-1 font-medium">Recommended next actions</p>
          <ul className="space-y-1 text-muted-foreground">
            {state.coachRecommendations.map((recommendation) => (
              <li key={recommendation}>- {recommendation}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.coachWarnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
          {state.coachWarnings.join(" ")}
        </div>
      ) : null}
      {state.coachPendingPatches.length > 0 ? (
        <div className="mt-3 rounded-md border p-2 text-sm">
          <p className="font-medium">Coach proposal</p>
          <p className="text-xs text-muted-foreground">
            {state.coachPendingPatches.length} policy patch
            {state.coachPendingPatches.length === 1 ? "" : "es"} ready to apply.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {state.coachPendingPatches.slice(0, 6).map((patch, index) => (
              <li key={`${patch.kind}-${index}`}>- {patch.kind}</li>
            ))}
            {state.coachPendingPatches.length > 6 ? (
              <li>...and {state.coachPendingPatches.length - 6} more</li>
            ) : null}
          </ul>
          {state.coachUnresolvedQuestions.length > 0 ? (
            <div className="mt-2 rounded border border-dashed p-2">
              <p className="text-xs font-medium">Unresolved questions</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {state.coachUnresolvedQuestions.slice(0, 3).map((question) => (
                  <li key={question}>- {question}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void actions.applyCoachProposal()}
              disabled={state.coachPolicyApplying}
            >
              {state.coachPolicyApplying ? "Applying..." : "Apply to calendar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={actions.rejectCoachProposal}
              disabled={state.coachPolicyApplying}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}
      {state.coachPendingPatches.length === 0 &&
      state.coachLastProposalMeta &&
      state.coachLastProposalMeta.policyPatchCount === 0 &&
      (state.coachUnresolvedQuestions.length > 0 || state.coachWarnings.length > 0) ? (
        <div className="mt-3 rounded-md border border-dashed p-2 text-sm">
          <p className="font-medium">No direct calendar edits returned</p>
          <p className="text-xs text-muted-foreground">
            This reply included guidance, but no applicable calendar changes.
          </p>
          {state.coachUnresolvedQuestions.length > 0 ? (
            <div className="mt-2 rounded border border-dashed p-2">
              <p className="text-xs font-medium">Coach follow-up questions</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {state.coachUnresolvedQuestions.slice(0, 3).map((question) => (
                  <li key={question}>- {question}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={actions.requestCalendarEditsFromCoach}
            >
              Ask coach for apply-able edits
            </Button>
          </div>
        </div>
      ) : null}
      {state.hasCoachUndoSnapshot ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void actions.undoCoachProposal()}
            disabled={state.coachPolicyApplying}
          >
            {state.coachPolicyApplying ? "Saving..." : "Undo latest apply"}
          </Button>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
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
            variant="outline"
            onClick={actions.startNewCoachConversation}
            disabled={
              state.coachLoading ||
              state.coachPolicyApplying ||
              !state.hasCoachConversationState
            }
          >
            New conversation
          </Button>
          <Button
            type="button"
            onClick={() => void actions.sendCoachMessage()}
            disabled={state.coachLoading || state.coachInput.trim().length === 0}
          >
            {state.coachLoading ? "Thinking..." : "Send to coach"}
          </Button>
        </div>
      </div>
    </div>
  );
}
