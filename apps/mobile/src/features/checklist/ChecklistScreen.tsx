import { FlashList } from "@shopify/flash-list";
import { Link } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
  resolveLanePageSnapInterval,
  resolveLanePageWidth,
  shouldUseLanePager,
} from "../duo/lane-pager";
import {
  buildChecklistListItems,
  type ChecklistListItem,
} from "./checklist-list-model";
import {
  countMobileChecklistGoalVisibility,
  filterMobileChecklistGoals,
  type ChecklistVisibilityFilters,
} from "./checklist-visibility";
import { ChecklistGoalRow } from "./ChecklistGoalRow";
import { useChecklistClock, useChecklistLaneData } from "./use-checklist-data";

export function ChecklistScreen({
  plannerNavigation,
}: {
  plannerNavigation?: ReactNode;
} = {}) {
  const theme = useTheme();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ChecklistVisibilityFilters>({
    showPastGoals: false,
    showUpcomingGoals: false,
    showArchivedGoals: false,
    showCompletedGoals: false,
  });
  const { width: viewportWidth } = useWindowDimensions();
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
  const useLanePager = shouldUseLanePager(lanes.length);
  const lanePageWidth = resolveLanePageWidth(viewportWidth);
  const lanePageSnapInterval = resolveLanePageSnapInterval(lanePageWidth);
  const laneDataById = useMemo(
    () =>
      ({
        viewer: viewerLane,
        partner: partnerLane,
      }) as const,
    [partnerLane, viewerLane]
  );
  const visibleLaneDataById = useMemo(
    () =>
      ({
        viewer: {
          ...viewerLane,
          goals: filterMobileChecklistGoals({
            goals: viewerLane.goals,
            completedGoalIds: viewerLane.completedForView,
            asOfDate,
            filters,
          }),
        },
        partner: {
          ...partnerLane,
          goals: filterMobileChecklistGoals({
            goals: partnerLane.goals,
            completedGoalIds: partnerLane.completedForView,
            asOfDate,
            filters,
          }),
        },
      }) as const,
    [asOfDate, filters, partnerLane, viewerLane]
  );
  const visibilityCounts = useMemo(
    () =>
      lanes.reduce(
        (total, lane) => {
          const laneData = laneDataById[lane.id];
          const counts = countMobileChecklistGoalVisibility({
            goals: laneData.goals,
            completedGoalIds: laneData.completedForView,
            asOfDate,
          });
          return {
            past: total.past + counts.past,
            upcoming: total.upcoming + counts.upcoming,
            archived: total.archived + counts.archived,
            completed: total.completed + counts.completed,
          };
        },
        { past: 0, upcoming: 0, archived: 0, completed: 0 }
      ),
    [asOfDate, laneDataById, lanes]
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
          laneData: visibleLaneDataById[lane.id],
        })),
      }),
    [asOfDate, lanes, scope, visibleLaneDataById]
  );
  const lanePagedItems = useMemo(
    () =>
      lanes.map((lane) => ({
        laneId: lane.id,
        items: buildChecklistListItems({
          scope,
          asOfDate,
          showNewGoalAction: lane.id === "viewer" && scope !== "partner",
          summaryStrip: null,
          lanes: [
            {
              lane: {
                id: lane.id,
                label: lane.label,
                readOnly: lane.readOnly,
              },
              laneData: laneDataById[lane.id],
            },
          ],
        }),
      })),
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

    if (item.type === "goal_row") {
      const laneData = laneDataById[item.laneId];
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
  const visibilityOptions: Array<{
    key: keyof ChecklistVisibilityFilters;
    label: string;
    count: number;
  }> = [
    {
      key: "showPastGoals",
      label: "Show past goals",
      count: visibilityCounts.past,
    },
    {
      key: "showUpcomingGoals",
      label: "Show upcoming goals",
      count: visibilityCounts.upcoming,
    },
    {
      key: "showArchivedGoals",
      label: "Show archived goals",
      count: visibilityCounts.archived,
    },
    {
      key: "showCompletedGoals",
      label: "Show completed goals",
      count: visibilityCounts.completed,
    },
  ];

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <Screen title={plannerNavigation ? "Planner" : "Checklist"} scroll={false}>
      {plannerNavigation}
      <DuoScopeSegmentedControl surface="checklist" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open checklist filters"
        style={[styles.filterButton, { borderColor: theme.colors.border }]}
        onPress={() => setFiltersOpen(true)}
      >
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Checklist filters
        </Text>
      </Pressable>
      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setFiltersOpen(false)}
        >
          <View
            style={[
              styles.filterSheet,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.filterHeader}>
              <Text
                accessibilityRole="header"
                style={{
                  color: theme.colors.foreground,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                Checklist filters
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close checklist filters"
                onPress={() => setFiltersOpen(false)}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                  Done
                </Text>
              </Pressable>
            </View>
            <View style={styles.filterGrid}>
              {visibilityOptions.map((option) => (
                <Pressable
                  key={option.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: filters[option.key] }}
                  style={[
                    styles.filterOption,
                    { borderColor: theme.colors.border },
                  ]}
                  onPress={() =>
                    setFilters((previous) => ({
                      ...previous,
                      [option.key]: !previous[option.key],
                    }))
                  }
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: filters[option.key]
                          ? theme.colors.primary
                          : "transparent",
                      },
                    ]}
                  />
                  <Text style={{ color: theme.colors.foreground, flex: 1 }}>
                    {option.label}
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground }}>
                    ({option.count})
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
      {useLanePager ? (
        <ScrollView
          horizontal
          snapToInterval={lanePageSnapInterval}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.lanePagerContent}
        >
          {lanePagedItems.map((page) => (
            <View key={page.laneId} style={[styles.lanePage, { width: lanePageWidth }]}>
              <FlashList
                data={page.items}
                keyExtractor={(item) => item.key}
                getItemType={(item) => item.type}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlashList
          data={listItems}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 12 },
  filterButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  filterSheet: {
    borderWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 16,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterOption: {
    width: "48%",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderRadius: 4,
  },
  lanePagerContent: {
    paddingRight: 12,
    gap: 12,
  },
  lanePage: {
    flexShrink: 0,
  },
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
