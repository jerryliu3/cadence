import { FlashList } from "@shopify/flash-list";
import { Link } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import { LoadingScreen, Screen } from "../../ui/screen";
import { useDuo, useDuoSurfaceScope } from "../duo/DuoProvider";
import { DuoScopeSegmentedControl } from "../duo/DuoScopeSegmentedControl";
import {
  useReportMobileDuoScopeViewed,
} from "../duo/telemetry";
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
import { useChecklistClock, useChecklistLaneData } from "./use-checklist-data";

export function ChecklistScreen() {
  const theme = useTheme();
  const { ready, scope, hasActivePartner } =
    useDuoSurfaceScope("checklist");
  const { state } = useDuo();
  const activePartner = hasActivePartner ? state.activePartner : null;
  useReportMobileDuoScopeViewed({
    enabled: ready,
    surface: "checklist",
    scope,
    hasPartner: Boolean(activePartner),
  });
  const { asOfDate } = useChecklistClock();
  const partnerId = activePartner?.partnerId ?? null;
  const partnerSubject = partnerLaneSubject(activePartner);
  const viewerSubject = viewerLaneSubject();
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
  const listItems = useMemo(
    () =>
      buildChecklistListItems({
        scope,
        asOfDate,
        showNewGoalAction: scope !== "partner",
        summaryStrip: null,
        lanes: lanes.map((lane) => ({
          lane: {
            id: lane.id,
            label: lane.label,
            readOnly: lane.readOnly,
          },
          laneData: laneDataById[lane.id],
        })),
      }),
    [asOfDate, laneDataById, lanes, scope]
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
          readOnlyReason={item.readOnlyReason}
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

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <Screen title="Checklist" scroll={false}>
      <DuoScopeSegmentedControl surface="checklist" />
      <FlashList
        data={listItems}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
