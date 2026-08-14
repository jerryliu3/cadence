import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import { Screen } from "../../ui/screen";
import { useDuo, useDuoSurfaceScope } from "../duo/DuoProvider";
import { DuoScopeSegmentedControl } from "../duo/DuoScopeSegmentedControl";
import { resolveMobileDuoLaneSubjects } from "../duo/lane-subjects";
import { resolvePartnerChecklistStripState } from "./checklist-lane-data";
import { useChecklistClock, useChecklistLaneData } from "./use-checklist-data";

export function ChecklistScreen() {
  const theme = useTheme();
  const { scope, hasActivePartner, setScopePreference } = useDuoSurfaceScope("checklist");
  const { state } = useDuo();
  const activePartner = hasActivePartner ? state.activePartner : null;
  const { asOfDate } = useChecklistClock();
  const partnerId = activePartner?.partnerId ?? null;
  const partnerName =
    activePartner?.partnerDisplayName ?? activePartner?.partnerUsername ?? "Partner";
  const partnerSubject = {
    id: "partner" as const,
    label: partnerName,
    userId: partnerId ?? undefined,
    readOnly: true,
    avatarUrl: activePartner?.partnerAvatarUrl ?? null,
  };
  const viewerLane = useChecklistLaneData({
    subject: {
      id: "viewer",
      label: "Mine",
      readOnly: false,
    },
    partnerId,
    enabled: true,
  });
  const partnerLane = useChecklistLaneData({
    subject: partnerSubject,
    partnerId,
    enabled: Boolean(activePartner) && scope !== "me",
  });
  const partnerStripLane = useChecklistLaneData({
    subject: partnerSubject,
    partnerId,
    enabled: Boolean(activePartner) && scope === "me",
    includeGoals: false,
  });
  const lanes = resolveMobileDuoLaneSubjects({
    scope,
    activePartner,
  });
  const partnerStripState = resolvePartnerChecklistStripState({
    hasActivePartner: Boolean(activePartner),
    isLoading: partnerStripLane.loading,
    error: partnerStripLane.error,
    progress: partnerStripLane.progress,
    asOfDate,
  });

  return (
    <Screen title="Checklist">
      <DuoScopeSegmentedControl surface="checklist" />
      <Text style={{ color: theme.colors.mutedForeground }}>{asOfDate}</Text>
      {scope !== "partner" ? (
        <Link href="/goals/new" style={{ color: theme.colors.primary, fontWeight: "700" }}>
          New goal
        </Link>
      ) : null}
      {scope === "me" && activePartner ? (
        <View
          style={[
            styles.summaryStrip,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
          ]}
        >
          <View style={styles.summaryCopy}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {partnerName}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {partnerStripState.status === "loading"
                ? "Loading partner checklist..."
                : partnerStripState.status === "unavailable"
                  ? "Partner checklist is unavailable."
                  : partnerStripState.status === "ready"
                    ? `${partnerStripState.completionCount} completion${
                        partnerStripState.completionCount === 1 ? "" : "s"
                      } today · ${partnerStripState.goalCount} goals`
                    : ""}
            </Text>
          </View>
          <Pressable
            style={[styles.summaryAction, { borderColor: theme.colors.border }]}
            onPress={() => {
              void setScopePreference("partner");
            }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
              View partner
            </Text>
          </Pressable>
        </View>
      ) : null}
      {lanes.map((lane) => {
        const laneData = lane.id === "viewer" ? viewerLane : partnerLane;
        const partnerUnavailable = lane.id === "partner" && laneData.error;
        return (
          <View key={lane.id} style={styles.section}>
            {scope !== "me" ? (
              <View style={styles.headingRow}>
                <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                  {lane.label}
                </Text>
                {lane.readOnly ? (
                  <Text
                    style={[
                      styles.readOnlyTag,
                      {
                        borderColor: theme.colors.border,
                        color: theme.colors.mutedForeground,
                      },
                    ]}
                  >
                    Read-only
                  </Text>
                ) : null}
              </View>
            ) : null}
            {laneData.loading ? (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Loading {lane.label.toLowerCase()} checklist...
              </Text>
            ) : partnerUnavailable ? (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Partner checklist is unavailable.
              </Text>
            ) : laneData.error ? (
              <Text style={{ color: theme.colors.destructive }}>
                {laneData.error instanceof Error
                  ? laneData.error.message
                  : "Could not load checklist."}
              </Text>
            ) : laneData.goals.length === 0 ? (
              <Text style={{ color: theme.colors.mutedForeground }}>No goals yet.</Text>
            ) : (
              laneData.goals.map((goal) => {
                const done = laneData.completedToday.has(goal.id);
                return (
                  <View
                    key={goal.id}
                    style={[
                      styles.row,
                      { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
                    ]}
                  >
                    {laneData.interactive ? (
                      <Pressable
                        disabled={laneData.toggling}
                        onPress={() => {
                          if (!laneData.toggle) {
                            return;
                          }
                          void laneData.toggle({
                            goalId: goal.id,
                            desiredFactState: done ? "absent" : "present",
                          });
                        }}
                        style={[
                          styles.toggle,
                          {
                            backgroundColor: done ? theme.colors.primary : theme.colors.secondary,
                          },
                        ]}
                      >
                        <Text style={{ color: theme.colors.primaryForeground }}>
                          {done ? "✓" : ""}
                        </Text>
                      </Pressable>
                    ) : (
                      <View
                        style={[
                          styles.readOnlyStatus,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.secondary,
                          },
                        ]}
                      >
                        <Text style={{ color: theme.colors.mutedForeground }}>
                          {done ? "✓" : ""}
                        </Text>
                      </View>
                    )}
                    {laneData.interactive ? (
                      <Link href={`/goals/${goal.id}`} style={styles.titleWrap}>
                        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                          {goal.title}
                        </Text>
                        <Text style={{ color: theme.colors.mutedForeground }}>
                          {goal.category}
                        </Text>
                      </Link>
                    ) : (
                      <View style={styles.titleWrap}>
                        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                          {goal.title}
                        </Text>
                        <Text style={{ color: theme.colors.mutedForeground }}>
                          {goal.category}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryStrip: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
  },
  summaryAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  section: { gap: 8 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readOnlyTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  readOnlyStatus: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1, gap: 2 },
});
