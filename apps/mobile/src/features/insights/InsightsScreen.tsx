import { getHeatmapScaleHex } from "@cadence/shared/goals/heatmap";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { api } from "../../lib/api";
import { getMobileTheme } from "../../theme";
import { LoadingScreen, Screen } from "../../ui/screen";

interface ProgressContextResponse {
  facts: Array<{ completed_on: string }>;
}

function timezoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function InsightsScreen() {
  const theme = getMobileTheme();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const monthDate = useMemo(() => new Date(`${month}-01T00:00:00`), [month]);
  const factsFrom = format(startOfMonth(monthDate), "yyyy-MM-dd");
  const factsTo = format(endOfMonth(monthDate), "yyyy-MM-dd");
  const asOfDate = format(new Date(), "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["mobile-insights", factsFrom, factsTo],
    queryFn: () =>
      api.getJson<ProgressContextResponse>("/api/progress/context", {
        query: {
          asOfDate,
          timezone: timezoneName(),
          factsFrom,
          factsTo,
        },
      }),
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const fact of query.data?.facts ?? []) {
      map[fact.completed_on] = (map[fact.completed_on] ?? 0) + 1;
    }
    return map;
  }, [query.data]);

  const cells = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const days: string[] = [];
    for (
      let cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      days.push(format(cursor, "yyyy-MM-dd"));
    }
    const offset = (start.getDay() + 6) % 7;
    return { days, offset };
  }, [monthDate]);

  if (query.isLoading) {
    return <LoadingScreen />;
  }

  const cell = 16;
  const gap = 4;
  const width = 7 * (cell + gap);
  const rows = Math.ceil((cells.offset + cells.days.length) / 7);
  const height = rows * (cell + gap);

  return (
    <Screen title="Insights">
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            const next = new Date(monthDate);
            next.setMonth(next.getMonth() - 1);
            setMonth(format(next, "yyyy-MM"));
          }}
        >
          <Text style={{ color: theme.colors.primary }}>Prev</Text>
        </Pressable>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{month}</Text>
        <Pressable
          onPress={() => {
            const next = new Date(monthDate);
            next.setMonth(next.getMonth() + 1);
            setMonth(format(next, "yyyy-MM"));
          }}
        >
          <Text style={{ color: theme.colors.primary }}>Next</Text>
        </Pressable>
      </View>
      <Svg width={width} height={height}>
        {cells.days.map((date, index) => {
          const x = ((cells.offset + index) % 7) * (cell + gap);
          const y = Math.floor((cells.offset + index) / 7) * (cell + gap);
          return (
            <Rect
              key={date}
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={3}
              fill={getHeatmapScaleHex(counts[date] ?? 0)}
            />
          );
        })}
      </Svg>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
});
