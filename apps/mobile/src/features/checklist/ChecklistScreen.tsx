import { FlashList } from "@shopify/flash-list";
import { Link } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import { Screen } from "../../ui/screen";
import { useDuo, useDuoSurfaceScope } from "../duo/DuoProvider";
import { DuoScopeSegmentedControl } from "../duo/DuoScopeSegmentedControl";
import {
  partnerLaneSubject,
  resolveMobileDuoLaneSubjects,
  viewerLaneSubject,
} from "../duo/lane-subjects";
import {
  buildChecklistListItems,
  type ChecklistListItem,
} from "./checklist-list-model";
import { ChecklistGoalRow } from "./ChecklistGoalRow";
import { resolvePartnerChecklistStripState } from "./checklist-lane-data";
import { useChecklistClock, useChecklistLaneData } from "./use-checklist-data";

export function ChecklistScreen() {
  const theme = useTheme();
  const { scope, hasActivePartner, setScopePreference } = useDuoSurfaceScope("checklist");
  const { state } = useDuo();
  const activePartner = hasActivePartner ? state.activePartner : null;
  const { asOfDate } = useChecklistClock();
  const partnerId = activePartner?.partnerId ?? null;
  const partnerSubject = partnerLaneSubject(activePartner);
  const viewerSubject = viewerLaneSubject();
  const partnerName = partnerSubject?.label ?? "Partner";
  const viewerLane = useChecklistLaneData({
    subject: viewerSubject,
    partnerId,
    enabled: true,
  });
  const partnerLane = useChecklistLaneData({
    subject: partnerSubject ?? viewerSubject,
    partnerId,
    enabled: Boolean(activePartner) && scope !== "me",
  });
  const partnerStripLane = useChecklistLaneData({
    subject: partnerSubject ?? viewerSubject,
    partnerId,
    enabled: Boolean(activePartner) && scope === "me",
    includeGoals: false,
  });
  const lanes = resolveMobileDuoLaneSubjects({
    scope,
    activePartner,
  });
  const laneDataById = useMemo(
    () =>
      ({
        viewer: viewerLane,
        partner: partnerLane,
      }) as const,
    [partnerLane, viewerLane]
  );
  const partnerStripState = resolvePartnerChecklistStripState({
    hasActivePartner: Boolean(activePartner),
    isLoading: partnerStripLane.loading,
    error: partnerStripLane.error,
    progress: partnerStripLane.progress,
    asOfDate,
  });
  const summaryStrip = useMemo(
    () =>
      scope === "me" && activePartner
        ? partnerStripState.status === "loading"
          ? ({ status: "loading", partnerName } as const)
          : partnerStripState.status === "unavailable"
            ? ({ status: "unavailable", partnerName } as const)
            : partnerStripState.status === "ready"
              ? ({
                  status: "ready",
                  partnerName,
                  completionCount: partnerStripState.completionCount,
                  goalCount: partnerStripState.goalCount,
                } as const)
              : null
        : null,
    [activePartner, partnerName, partnerStripState, scope]
  );
  const listItems = useMemo(
    () =>
      buildChecklistListItems({
        scope,
        asOfDate,
        showNewGoalAction: scope !== "partner",
        summaryStrip,
        lanes: lanes.map((lane) => ({
          lane: {
            id: lane.id,
            label: lane.label,
            readOnly: lane.readOnly,
          },
          laneData: laneDataById[lane.id],
        })),
      }),
    [asOfDate, laneDataById, lanes, scope, summaryStrip]
  );
  const renderItem = ({ item }: { item: ChecklistListItem }) => {
    if (item.type === "date") {
      return (
        <Text style={{ color: theme.colors.mutedForeground }}>
          {item.asOfDate}
        </Text>
      );
    }

    if (item.type === "new_goal") {
      return (
        <Link href="/goals/new" style={{ color: theme.colors.primary, fontWeight: "700" }}>
          New goal
        </Link>
      );
    }

    if (item.type === "summary_strip") {
      return (
        <View
          style={[
            styles.summaryStrip,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
          ]}
        >
          <View style={styles.summaryCopy}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {item.summary.partnerName}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {item.summary.status === "loading"
                ? "Loading partner checklist..."
                : item.summary.status === "unavailable"
                  ? "Partner checklist is unavailable."
                  : `${item.summary.completionCount} completion${
                      item.summary.completionCount === 1 ? "" : "s"
                    } today · ${item.summary.goalCount} goals`}
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
      );
    }

    if (item.type === "lane_heading") {
      return (
        <View style={styles.headingRow}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {item.label}
          </Text>
          {item.readOnly ? (
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
      );
    }

    if (item.type === "lane_message") {
      return (
        <Text
          style={{
            color:
              item.tone === "destructive"
                ? theme.colors.destructive
                : theme.colors.mutedForeground,
          }}
        >
          {item.text}
        </Text>
      );
    }

    const laneData = laneDataById[item.laneId];
    if (item.type === "goal_row") {
      return (
        <ChecklistGoalRow
          title={item.title}
          category={item.category}
          done={item.done}
          interactive={item.interactive}
          href={item.interactive ? `/goals/${item.goalId}` : undefined}
          toggling={laneData.toggling}
          onToggle={() => {
            laneData.toggle?.({
              goalId: item.goalId,
              desiredFactState: item.done ? "absent" : "present",
            });
          }}
        />
      );
    }

    return null;
  };

  return (
    <Screen title="Checklist" scroll={false}>
      <DuoScopeSegmentedControl surface="checklist" />
      <FlashList
        data={listItems}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />
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
  listContent: { paddingBottom: 12 },
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
