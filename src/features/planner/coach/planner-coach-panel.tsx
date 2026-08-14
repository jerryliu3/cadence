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
        <Button
          type="button"
          size="sm"
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
        <Select
          value={state.selectedSavedCoachConversationId || undefined}
          onValueChange={(value) => {
            actions.setSelectedSavedCoachConversationId(value);
            void actions.restoreSavedCoachConversation(value);
          }}
          disabled={state.coachConversationsLoading || state.coachConversationRestoring}
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
              {message.role === "assistant" && message.proposal ? (
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
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
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
