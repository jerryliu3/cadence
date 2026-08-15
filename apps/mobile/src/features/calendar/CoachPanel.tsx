import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiErrorMessage } from "@cadence/shared/api-client";
import { api } from "../../lib/api";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import {
  type CoachPolicyPatch,
  type MobilePlannerPolicy,
} from "./coach-policy";
import {
  buildMobileCoachProposal,
  markMobileCoachProposalApplied,
  restoreMobileCoachMessages,
  serializeMobileCoachMessages,
  type MobileCoachMessage,
} from "./coach-conversation";
import {
  applyMobileCoachPatches,
  buildMobileCoachRequest,
} from "./mobile-coach";
import type { MobilePlannerDraftState } from "./mobile-planner-draft";
import type { PlannerContextPayload } from "@cadence/shared/planner/context";

interface CoachResponsePayload {
  reply: string;
  proposal?: { policyPatches?: CoachPolicyPatch[]; unresolvedQuestions?: string[] };
  warnings?: string[];
  recommendations?: Array<{ text: string }>;
}

interface SavedConversation {
  id: string;
  title: string;
  updatedAt: string;
}

export function CoachPanel({
  context,
  currentMonth,
  draft,
  onDraftChange,
}: {
  context: PlannerContextPayload;
  currentMonth: string;
  draft: MobilePlannerDraftState;
  onDraftChange: (state: MobilePlannerDraftState) => void;
}) {
  const theme = useTheme();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MobileCoachMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedConversation[]>([]);

  const send = async () => {
    const content = input.trim();
    if (!content) {
      return;
    }
    const nextMessages: MobileCoachMessage[] = [
      ...messages,
      { role: "user", content, createdAt: Date.now() },
    ];
    setInput("");
    setBusy(true);
    setStatus(null);
    try {
      const request = buildMobileCoachRequest({
        context,
        currentMonth,
        state: draft,
        messages: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
      const payload = await api.postJson<CoachResponsePayload>(
        "/api/planner/coach",
        request,
        { timeoutMs: 65_000 }
      );
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: payload.reply,
          createdAt: Date.now(),
          proposal: buildMobileCoachProposal({
            policyPatches: payload.proposal?.policyPatches ?? [],
            unresolvedQuestions:
              payload.proposal?.unresolvedQuestions ?? [],
            baselinePolicy:
              (draft.policy as MobilePlannerPolicy | null) ??
              context.preferences?.defaultPolicy ??
              null,
          }),
        },
      ]);
      if (payload.warnings?.length) {
        setStatus(payload.warnings.join(" "));
      }
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Coach response failed."));
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
  };

  const applyPatches = async (
    patches: CoachPolicyPatch[],
    messageIndex: number
  ) => {
    setBusy(true);
    try {
      const result = await applyMobileCoachPatches({
        client: {
          postJson: (path, body) => api.postJson(path, body),
          putJson: (path, body) => api.putJson(path, body),
        },
        context,
        currentMonth,
        state: draft,
        patches,
      });
      if (
        result.appliedPolicyPatchCount === 0 &&
        result.queuedSessionMoves === 0
      ) {
        setStatus(
          result.missingSessionMoves > 0
            ? "Coach suggested a session that is not available in this draft."
            : "No calendar changes were available to apply."
        );
        return;
      }
      onDraftChange(result.state);
      setMessages((current) =>
        markMobileCoachProposalApplied(current, messageIndex)
      );
      const moveCount =
        result.queuedSessionMoves + result.policyReplanMoves;
      const missingSuffix =
        result.missingSessionMoves > 0
          ? ` ${result.missingSessionMoves} session reference${
              result.missingSessionMoves === 1 ? "" : "s"
            } could not be applied.`
          : "";
      setStatus(
        `Coach changes are in your draft${
          moveCount > 0
            ? ` with ${moveCount} session move${moveCount === 1 ? "" : "s"}`
            : ""
        }. Review and save when ready.${missingSuffix}`
      );
    } catch (error) {
      setStatus(
        getApiErrorMessage(error, "Could not add the coach proposal to the draft.")
      );
    } finally {
      setBusy(false);
    }
  };

  const loadSaved = async () => {
    setBusy(true);
    try {
      const payload = await api.getJson<{ conversations: SavedConversation[] }>(
        "/api/planner/coach/conversations",
        { query: { scopeMonth: context.scopeMonth, limit: 20 } }
      );
      setSaved(payload.conversations ?? []);
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Saved conversations could not be loaded."));
    } finally {
      setBusy(false);
    }
  };

  const saveConversation = async () => {
    if (messages.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await api.postJson("/api/planner/coach/conversations", {
        scopeMonth: context.scopeMonth,
        timezone: context.timezone,
        messages: serializeMobileCoachMessages(messages),
      });
      setStatus("Conversation saved.");
      await loadSaved();
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Coach conversation could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const restoreConversation = async (conversationId: string) => {
    setBusy(true);
    try {
      const payload = await api.getJson<{
        messages: Parameters<typeof restoreMobileCoachMessages>[0];
      }>(`/api/planner/coach/conversations/${conversationId}`);
      setMessages(restoreMobileCoachMessages(payload.messages ?? []));
      setStatus("Conversation restored.");
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Saved conversation could not be restored."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { borderColor: theme.colors.border }]}>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>AI Coach</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Ask for guidance across the current planner window. Proposals can update
        rest days, blackout ranges, and existing session dates.
      </Text>
      <ScrollView style={styles.transcript}>
        {messages.length === 0 ? (
          <Text style={{ color: theme.colors.mutedForeground }}>
            {'Start with a goal question, for example: "Help me build a 4-week running routine."'}
          </Text>
        ) : (
          messages.map((message, index) => (
            <View
              key={`${message.createdAt}-${index}`}
              style={[
                styles.bubble,
                {
                  backgroundColor:
                    message.role === "user" ? theme.colors.accent : theme.colors.muted,
                },
              ]}
            >
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>
                {message.role === "user" ? "You" : "Coach"}
              </Text>
              <Text style={{ color: theme.colors.foreground }}>{message.content}</Text>
              {message.proposal?.applyStatus === "manually_applied" ? (
                <Text style={{ color: theme.colors.mutedForeground }}>
                  Calendar proposal applied
                </Text>
              ) : message.proposal?.policyPatches.length ? (
                <Pressable
                  onPress={() =>
                    void applyPatches(
                      message.proposal?.policyPatches ?? [],
                      index
                    )
                  }
                  disabled={busy}
                >
                  <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                    Apply calendar proposal
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Ask the coach"
        placeholderTextColor={theme.colors.mutedForeground}
        style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
      />
      <PrimaryButton disabled={busy || input.trim().length === 0} label={busy ? "Working..." : "Send"} onPress={() => void send()} />
      <View style={styles.row}>
        <Pressable disabled={busy || messages.length === 0} onPress={() => void saveConversation()}>
          <Text style={{ color: theme.colors.primary }}>Save</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => void loadSaved()}>
          <Text style={{ color: theme.colors.primary }}>Load saved</Text>
        </Pressable>
      </View>
      {saved.map((conversation) => (
        <Pressable
          key={conversation.id}
          onPress={() => void restoreConversation(conversation.id)}
        >
          <Text style={{ color: theme.colors.foreground }}>{conversation.title}</Text>
        </Pressable>
      ))}
      {status ? <Text style={{ color: theme.colors.foreground }}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  transcript: { maxHeight: 220 },
  bubble: { borderRadius: 8, padding: 8, marginBottom: 8, gap: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: "row", justifyContent: "space-between" },
});
