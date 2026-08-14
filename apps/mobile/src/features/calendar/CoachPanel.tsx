import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiErrorMessage } from "@cadence/shared/api-client";
import { api } from "../../lib/api";
import { getMobileTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import {
  applyCoachPolicyPatches,
  buildCoachDeterministicSummary,
  type CoachPolicyPatch,
  type MobilePlannerPolicy,
} from "./coach-policy";
import type { MobilePlannerContext } from "./use-planner-context";

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  policyPatches?: CoachPolicyPatch[];
}

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
  onApplied,
}: {
  context: MobilePlannerContext;
  onApplied: () => Promise<unknown>;
}) {
  const theme = getMobileTheme();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedConversation[]>([]);

  const summary = useMemo(
    () =>
      buildCoachDeterministicSummary({
        scopeMonth: context.scopeMonth,
        timezone: context.timezone,
        asOfDate: context.asOfDate,
        workUnits: context.preview?.workUnits ?? [],
        goalTitles: context.goalTitles,
      }),
    [context]
  );

  const send = async () => {
    const content = input.trim();
    if (!content) {
      return;
    }
    const nextMessages: CoachMessage[] = [
      ...messages,
      { role: "user", content, createdAt: Date.now() },
    ];
    setInput("");
    setBusy(true);
    setStatus(null);
    try {
      const payload = await api.postJson<CoachResponsePayload>(
        "/api/planner/coach",
        {
          scopeMonth: context.scopeMonth,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          focusGoalIds: [],
          deterministicSummary: summary,
        },
        { timeoutMs: 65_000 }
      );
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: payload.reply,
          createdAt: Date.now(),
          policyPatches: payload.proposal?.policyPatches,
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

  const applyPatches = async (patches: CoachPolicyPatch[]) => {
    const currentPolicy = context.preferences?.defaultPolicy as
      | MobilePlannerPolicy
      | undefined;
    if (!currentPolicy) {
      setStatus("Confirm planner timezone on web before applying coach edits.");
      return;
    }
    const { policy, appliedPatchCount } = applyCoachPolicyPatches({
      policy: currentPolicy,
      patches,
    });
    if (appliedPatchCount === 0) {
      setStatus("No calendar policy changes to apply.");
      return;
    }
    setBusy(true);
    try {
      await api.putJson("/api/planner/context", {
        timezone: context.timezone,
        defaultPolicy: policy,
      });
      await api.postJson("/api/planner/context", {
        scopeMonth: context.scopeMonth,
        timezone: context.timezone,
        policy,
        source: context.activePlan ? "update" : "manual",
        solveIntent: "replan",
        draftCommands: [],
      });
      await onApplied();
      setStatus("Coach proposal applied and preview regenerated.");
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not apply coach proposal."));
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
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
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
        messages: Array<{ role: "user" | "assistant"; content: string; createdAt?: number }>;
      }>(`/api/planner/coach/conversations/${conversationId}`);
      setMessages(
        (payload.messages ?? []).map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt ?? Date.now(),
        }))
      );
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
        Ask for habit and training guidance for {context.scopeMonth}. Proposals can update rest
        days and blackout ranges, then replan.
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
              {message.policyPatches && message.policyPatches.length > 0 ? (
                <Pressable
                  onPress={() => void applyPatches(message.policyPatches ?? [])}
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
