import { getHeatmapScaleHex } from "@cadence/shared/goals/heatmap";
import { format } from "date-fns";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useTheme } from "../../theme";
import { LoadingScreen, Screen } from "../../ui/screen";
import { useDuo, useDuoSurfaceScope } from "../duo/DuoProvider";
import { DuoScopeSegmentedControl } from "../duo/DuoScopeSegmentedControl";
import { useReportMobileDuoScopeViewed } from "../duo/telemetry";
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
import { buildInsightsLaneRenderModel } from "./insights-lane-render-model";
import { InsightsLaneSection } from "./InsightsLaneSection";
import { useInsightsLaneData } from "./use-insights-lane-data";

export function InsightsScreen() {
  const theme = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const { ready, scope, hasActivePartner } =
    useDuoSurfaceScope("insights");
  const { state } = useDuo();
  const activePartner = hasActivePartner ? state.activePartner : null;
  useReportMobileDuoScopeViewed({
    enabled: ready,
    surface: "insights",
    scope,
    hasPartner: Boolean(activePartner),
  });
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const partnerSubject = partnerLaneSubject(activePartner);
  const viewerSubject = viewerLaneSubject();
  const viewerLane = useInsightsLaneData({
    subject: viewerSubject,
    month,
    enabled: true,
  });
  const partnerLane = useInsightsLaneData({
    subject: partnerSubject ?? viewerSubject,
    month,
    enabled: Boolean(activePartner) && scope !== "me",
  });
  const lanes = resolveMobileDuoLaneSubjects({
    scope,
    activePartner,
  });
  const useLanePager = shouldUseLanePager(lanes.length);
  const lanePageWidth = resolveLanePageWidth(viewportWidth);
  const lanePageSnapInterval = resolveLanePageSnapInterval(lanePageWidth);

  const cell = 16;
  const gap = 4;
  const width = 7 * (cell + gap);

  if (!ready) {
    return <LoadingScreen />;
  }

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
          {lanes.map((lane) => {
            const laneData = lane.id === "viewer" ? viewerLane : partnerLane;
            const renderModel = buildInsightsLaneRenderModel({
              scope,
              lane,
              loading: laneData.loading,
              error: laneData.error,
            });
            if (renderModel.status === "loading") {
              return (
                <View key={lane.id} style={[styles.lanePage, { width: lanePageWidth }]}>
                  <InsightsLaneSection
                    showHeading={Boolean(renderModel.heading)}
                    headingLabel={renderModel.heading?.label ?? lane.label}
                    readOnly={Boolean(renderModel.heading?.readOnly)}
                    tone="muted"
                    message={`Loading ${lane.label.toLowerCase()} insights...`}
                  />
                </View>
              );
            }

            if (renderModel.status === "partner_unavailable") {
              return (
                <View key={lane.id} style={[styles.lanePage, { width: lanePageWidth }]}>
                  <InsightsLaneSection
                    showHeading={Boolean(renderModel.heading)}
                    headingLabel={renderModel.heading?.label ?? lane.label}
                    readOnly={Boolean(renderModel.heading?.readOnly)}
                    tone="muted"
                    message="Partner insights are unavailable."
                  />
                </View>
              );
            }

            if (renderModel.status === "error") {
              return (
                <View key={lane.id} style={[styles.lanePage, { width: lanePageWidth }]}>
                  <InsightsLaneSection
                    showHeading={Boolean(renderModel.heading)}
                    headingLabel={renderModel.heading?.label ?? lane.label}
                    readOnly={Boolean(renderModel.heading?.readOnly)}
                    tone="destructive"
                    message={
                      laneData.error instanceof Error
                        ? laneData.error.message
                        : "Could not load insights."
                    }
                  />
                </View>
              );
            }

            const rows = Math.ceil((laneData.offset + laneData.days.length) / 7);
            const height = rows * (cell + gap);
            return (
              <View key={lane.id} style={[styles.lanePage, { width: lanePageWidth }]}>
                <InsightsLaneSection
                  showHeading={Boolean(renderModel.heading)}
                  headingLabel={renderModel.heading?.label ?? lane.label}
                  readOnly={Boolean(renderModel.heading?.readOnly)}
                >
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
                </InsightsLaneSection>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        lanes.map((lane) => {
        const laneData = lane.id === "viewer" ? viewerLane : partnerLane;
        const renderModel = buildInsightsLaneRenderModel({
          scope,
          lane,
          loading: laneData.loading,
          error: laneData.error,
        });
        if (renderModel.status === "loading") {
          return (
            <InsightsLaneSection
              key={lane.id}
              showHeading={Boolean(renderModel.heading)}
              headingLabel={renderModel.heading?.label ?? lane.label}
              readOnly={Boolean(renderModel.heading?.readOnly)}
              tone="muted"
              message={`Loading ${lane.label.toLowerCase()} insights...`}
            />
          );
        }

        if (renderModel.status === "partner_unavailable") {
          return (
            <InsightsLaneSection
              key={lane.id}
              showHeading={Boolean(renderModel.heading)}
              headingLabel={renderModel.heading?.label ?? lane.label}
              readOnly={Boolean(renderModel.heading?.readOnly)}
              tone="muted"
              message="Partner insights are unavailable."
            />
          );
        }

        if (renderModel.status === "error") {
          return (
            <InsightsLaneSection
              key={lane.id}
              showHeading={Boolean(renderModel.heading)}
              headingLabel={renderModel.heading?.label ?? lane.label}
              readOnly={Boolean(renderModel.heading?.readOnly)}
              tone="destructive"
              message={
                laneData.error instanceof Error
                  ? laneData.error.message
                  : "Could not load insights."
              }
            />
          );
        }

        const rows = Math.ceil((laneData.offset + laneData.days.length) / 7);
        const height = rows * (cell + gap);
          return (
            <InsightsLaneSection
              key={lane.id}
              showHeading={Boolean(renderModel.heading)}
              headingLabel={renderModel.heading?.label ?? lane.label}
              readOnly={Boolean(renderModel.heading?.readOnly)}
            >
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
            </InsightsLaneSection>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
  lanePagerContent: {
    paddingRight: 12,
    gap: 12,
  },
  lanePage: {
    flexShrink: 0,
  },
});
