import { useQuery } from "@tanstack/react-query";
import type { PublicProfileHeatmapPoint, PublicProfileXpSummary } from "@cadence/shared/social/public-profile";
import { getHeatmapScaleHex } from "@cadence/shared/goals/heatmap";
import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useTheme } from "../../theme";
import { UserAvatar } from "../../ui/user-avatar";
import { fetchMobilePublicProfile } from "./public-profile";

const DAY_MS = 24 * 60 * 60 * 1000;
const HEATMAP_CELL_SIZE = 10;
const HEATMAP_CELL_GAP = 2;

interface HeatmapCell {
  key: string;
  x: number;
  y: number;
  count: number;
}

function resolveStatDeltaLabel(delta: number, rangeLabel: "week" | "month") {
  if (delta === 0) {
    return `No change from last ${rangeLabel}`;
  }
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toLocaleString()} vs last ${rangeLabel}`;
}

function formatAchievementDate(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeYearDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildHeatmapCells({
  year,
  points,
}: {
  year: number;
  points: PublicProfileHeatmapPoint[];
}) {
  const yearStart = new Date(year, 0, 1);
  const firstWeekStart = normalizeYearDate(yearStart);
  firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());

  const cells: HeatmapCell[] = [];
  let maxWeekIndex = 0;
  for (const point of points) {
    const parsed = new Date(`${point.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const normalized = normalizeYearDate(parsed);
    const dayDelta = Math.floor(
      (normalized.getTime() - firstWeekStart.getTime()) / DAY_MS
    );
    const weekIndex = Math.floor(dayDelta / 7);
    if (weekIndex < 0) {
      continue;
    }
    maxWeekIndex = Math.max(maxWeekIndex, weekIndex);
    const weekday = normalized.getDay();
    cells.push({
      key: point.date,
      x: weekIndex * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP),
      y: weekday * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP),
      count: point.count,
    });
  }

  const width =
    (maxWeekIndex + 1) * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP) -
    HEATMAP_CELL_GAP;
  const height = 7 * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP) - HEATMAP_CELL_GAP;
  return { cells, width: Math.max(width, 0), height: Math.max(height, 0) };
}

function resolveXpProgressPercent(xp: PublicProfileXpSummary) {
  if (!xp.nextLevelMinXp || xp.nextLevelMinXp <= xp.currentLevelMinXp) {
    return 100;
  }
  const completedXp = xp.totalXp - xp.currentLevelMinXp;
  const spanXp = xp.nextLevelMinXp - xp.currentLevelMinXp;
  const percent = (completedXp / spanXp) * 100;
  return Math.max(0, Math.min(100, percent));
}

function YearHeatmap({
  points,
  year,
}: {
  points: PublicProfileHeatmapPoint[];
  year: number;
}) {
  const theme = useTheme();
  const model = useMemo(() => buildHeatmapCells({ year, points }), [points, year]);

  if (model.cells.length === 0) {
    return (
      <Text style={{ color: theme.colors.mutedForeground }}>
        No activity yet this year.
      </Text>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.heatmapScroll}
    >
      <Svg width={model.width} height={model.height}>
        {model.cells.map((cell) => (
          <Rect
            key={cell.key}
            x={cell.x}
            y={cell.y}
            width={HEATMAP_CELL_SIZE}
            height={HEATMAP_CELL_SIZE}
            rx={2}
            ry={2}
            fill={getHeatmapScaleHex(cell.count)}
            stroke={theme.colors.background}
            strokeWidth={0.6}
          />
        ))}
      </Svg>
    </ScrollView>
  );
}

export function PublicProfileSheetModal({
  visible,
  subjectUserId,
  onClose,
}: {
  visible: boolean;
  subjectUserId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const selectedYear = useMemo(() => new Date().getUTCFullYear(), []);

  const query = useQuery({
    queryKey: ["mobile-public-profile-sheet", subjectUserId, selectedYear],
    enabled: visible && Boolean(subjectUserId),
    queryFn: async () =>
      fetchMobilePublicProfile({
        subjectUserId: subjectUserId ?? "",
        year: selectedYear,
      }),
  });

  const bundle = query.data ?? null;
  const errorMessage =
    query.error instanceof Error
      ? query.error.message
      : "Public profile could not be loaded.";
  const displayName =
    bundle?.profile.displayName ??
    bundle?.profile.username ??
    "Cadence user";
  const username = bundle?.profile.username ?? null;
  const stats = bundle?.overallStats ?? null;
  const statItems = stats
    ? [
        {
          label: "Today",
          value: stats.todayActivities.toLocaleString(),
          helper: "Activities completed today",
        },
        {
          label: "Active streak",
          value: `${stats.activeStreakDays.toLocaleString()} days`,
          helper: "Consecutive active days",
        },
        {
          label: "This week",
          value: stats.currentWeekActivities.current.toLocaleString(),
          helper: resolveStatDeltaLabel(stats.currentWeekActivities.delta, "week"),
        },
        {
          label: "This month",
          value: stats.currentMonthActivities.current.toLocaleString(),
          helper: resolveStatDeltaLabel(stats.currentMonthActivities.delta, "month"),
        },
        {
          label: "Total activities",
          value: stats.totalActivities.toLocaleString(),
          helper: "All-time activity completions",
        },
        {
          label: "Goals completed",
          value: stats.totalGoalsCompleted.toLocaleString(),
          helper: "Goals completed all time",
        },
      ]
    : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text
              accessibilityRole="header"
              style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}
            >
              Public profile
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close public profile"
              onPress={onClose}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                Done
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {query.isLoading ? (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Loading profile...
              </Text>
            ) : null}
            {!query.isLoading && query.error ? (
              <Text style={{ color: theme.colors.destructive }}>
                {errorMessage}
              </Text>
            ) : null}
            {bundle ? (
              <>
                <View
                  style={[
                    styles.card,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.card,
                    },
                  ]}
                >
                  <View style={styles.identityRow}>
                    <UserAvatar
                      avatarUrl={bundle.profile.avatarUrl}
                      displayName={bundle.profile.displayName}
                      username={bundle.profile.username}
                      size={42}
                    />
                    <View style={styles.identityCopy}>
                      <Text
                        style={{
                          color: theme.colors.foreground,
                          fontWeight: "700",
                          fontSize: 22,
                        }}
                      >
                        {displayName}
                      </Text>
                      {username ? (
                        <Text
                          style={{
                            color: theme.colors.mutedForeground,
                            fontSize: 16,
                          }}
                        >
                          @{username}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                {bundle.profile.isPrivate ? (
                  <Text style={{ color: theme.colors.mutedForeground }}>
                    This account is private
                  </Text>
                ) : (
                  <>
                    {bundle.xp ? (
                      <View
                        style={[
                          styles.card,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.foreground,
                            fontWeight: "700",
                            fontSize: 18,
                          }}
                        >
                          XP progress
                        </Text>
                        <Text style={{ color: theme.colors.mutedForeground }}>
                          {bundle.xp.totalXp.toLocaleString()} XP total
                        </Text>
                        <View
                          style={[
                            styles.xpTrack,
                            { backgroundColor: theme.colors.border },
                          ]}
                        >
                          <View
                            style={[
                              styles.xpFill,
                              {
                                backgroundColor: theme.colors.primary,
                                width: `${resolveXpProgressPercent(bundle.xp)}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={{ color: theme.colors.mutedForeground }}>
                          Level {bundle.xp.currentLevel}
                          {bundle.xp.nextLevel
                            ? ` -> Level ${bundle.xp.nextLevel} (${bundle.xp.xpToNextLevel?.toLocaleString() ?? "0"} XP to go)`
                            : " -> Max level"}
                        </Text>
                      </View>
                    ) : null}

                    <View
                      style={[
                        styles.card,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.foreground,
                          fontWeight: "700",
                          fontSize: 18,
                        }}
                      >
                        Global achievements
                      </Text>
                      {bundle.globalAchievements.length === 0 ? (
                        <Text style={{ color: theme.colors.mutedForeground }}>
                          No global achievements yet.
                        </Text>
                      ) : (
                        bundle.globalAchievements.map((achievement) => {
                          const title =
                            achievement.title ??
                            achievement.code ??
                            "Untitled achievement";
                          const unlockedLabel = formatAchievementDate(
                            achievement.unlockedAt
                          );
                          return (
                            <View
                              key={achievement.id}
                              style={[
                                styles.achievementRow,
                                { borderColor: theme.colors.border },
                              ]}
                            >
                              <Text
                                style={{
                                  color: theme.colors.foreground,
                                  fontWeight: "700",
                                }}
                              >
                                {title}
                              </Text>
                              <Text style={{ color: theme.colors.mutedForeground }}>
                                {achievement.level
                                  ? `Level ${achievement.level}`
                                  : "Unlocked"}
                                {unlockedLabel ? ` · ${unlockedLabel}` : ""}
                              </Text>
                              {achievement.description ? (
                                <Text style={{ color: theme.colors.mutedForeground }}>
                                  {achievement.description}
                                </Text>
                              ) : null}
                              {achievement.revokedAt ? (
                                <Text style={{ color: theme.colors.destructive }}>
                                  Revoked
                                </Text>
                              ) : null}
                            </View>
                          );
                        })
                      )}
                    </View>

                    {stats ? (
                      <View
                        style={[
                          styles.card,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.foreground,
                            fontWeight: "700",
                            fontSize: 18,
                          }}
                        >
                          {selectedYear} activity heatmap
                        </Text>
                        <YearHeatmap
                          points={bundle.yearHeatmap}
                          year={selectedYear}
                        />
                        <View style={styles.statsGrid}>
                          {statItems.map((stat) => (
                            <View
                              key={stat.label}
                              style={[
                                styles.statCard,
                                {
                                  borderColor: theme.colors.border,
                                  backgroundColor: theme.colors.background,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: theme.colors.mutedForeground,
                                  fontSize: 13,
                                }}
                              >
                                {stat.label}
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.foreground,
                                  fontWeight: "700",
                                  fontSize: 18,
                                }}
                              >
                                {stat.value}
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.mutedForeground,
                                  fontSize: 13,
                                }}
                              >
                                {stat.helper}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  content: {
    paddingBottom: 26,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  identityCopy: {
    gap: 2,
    flex: 1,
  },
  xpTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  xpFill: {
    height: "100%",
  },
  achievementRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  heatmapScroll: {
    paddingBottom: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
});
