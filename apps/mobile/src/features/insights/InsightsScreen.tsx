import { getHeatmapScaleHex } from "@cadence/shared/goals/heatmap";
import { format } from "date-fns";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useTheme } from "../../theme";
import { Screen } from "../../ui/screen";
import { useDuo, useDuoSurfaceScope } from "../duo/DuoProvider";
import { DuoScopeSegmentedControl } from "../duo/DuoScopeSegmentedControl";
import { resolveMobileDuoLaneSubjects } from "../duo/lane-subjects";
import { useInsightsLaneData } from "./use-insights-lane-data";

export function InsightsScreen() {
  const theme = useTheme();
  const { scope, hasActivePartner } = useDuoSurfaceScope("insights");
  const { state } = useDuo();
  const activePartner = hasActivePartner ? state.activePartner : null;
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const partnerName =
    activePartner?.partnerDisplayName ?? activePartner?.partnerUsername ?? "Partner";
  const partnerSubject = {
    id: "partner" as const,
    label: partnerName,
    userId: activePartner?.partnerId,
    readOnly: true,
    avatarUrl: activePartner?.partnerAvatarUrl ?? null,
  };
  const viewerLane = useInsightsLaneData({
    subject: {
      id: "viewer",
      label: "Mine",
      readOnly: false,
    },
    month,
    enabled: true,
  });
  const partnerLane = useInsightsLaneData({
    subject: partnerSubject,
    month,
    enabled: Boolean(activePartner) && scope !== "me",
  });
  const lanes = resolveMobileDuoLaneSubjects({
    scope,
    activePartner,
  });

  const cell = 16;
  const gap = 4;
  const width = 7 * (cell + gap);

  return (
    <Screen title="Insights">
      <DuoScopeSegmentedControl surface="insights" />
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            const next = new Date(`${month}-01T00:00:00`);
            next.setMonth(next.getMonth() - 1);
            setMonth(format(next, "yyyy-MM"));
          }}
        >
          <Text style={{ color: theme.colors.primary }}>Prev</Text>
        </Pressable>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{month}</Text>
        <Pressable
          onPress={() => {
            const next = new Date(`${month}-01T00:00:00`);
            next.setMonth(next.getMonth() + 1);
            setMonth(format(next, "yyyy-MM"));
          }}
        >
          <Text style={{ color: theme.colors.primary }}>Next</Text>
        </Pressable>
      </View>
      {lanes.map((lane) => {
        const laneData = lane.id === "viewer" ? viewerLane : partnerLane;
        if (laneData.loading) {
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
              <Text style={{ color: theme.colors.mutedForeground }}>
                Loading {lane.label.toLowerCase()} insights...
              </Text>
            </View>
          );
        }

        if (lane.id === "partner" && laneData.error) {
          return (
            <View key={lane.id} style={styles.section}>
              {scope !== "me" ? (
                <View style={styles.headingRow}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                    {lane.label}
                  </Text>
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
                </View>
              ) : null}
              <Text style={{ color: theme.colors.mutedForeground }}>
                Partner insights are unavailable.
              </Text>
            </View>
          );
        }

        if (laneData.error) {
          return (
            <View key={lane.id} style={styles.section}>
              <Text style={{ color: theme.colors.destructive }}>
                {laneData.error instanceof Error
                  ? laneData.error.message
                  : "Could not load insights."}
              </Text>
            </View>
          );
        }

        const rows = Math.ceil((laneData.offset + laneData.days.length) / 7);
        const height = rows * (cell + gap);
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
            <Svg width={width} height={height}>
              {laneData.days.map((date, index) => {
                const x = ((laneData.offset + index) % 7) * (cell + gap);
                const y = Math.floor((laneData.offset + index) / 7) * (cell + gap);
                return (
                  <Rect
                    key={date}
                    x={x}
                    y={y}
                    width={cell}
                    height={cell}
                    rx={3}
                    fill={getHeatmapScaleHex(laneData.factsByDay[date] ?? 0)}
                  />
                );
              })}
            </Svg>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
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
});
