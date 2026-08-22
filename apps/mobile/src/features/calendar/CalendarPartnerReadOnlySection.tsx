import type { PlannerCompletionFactMarker } from "@cadence/shared/planner/context";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import { buildPartnerMarkerAccessibilityLabel } from "./calendar-duo";

export function CalendarPartnerReadOnlySection({
  visibleDays,
  markersByDate,
  loading,
}: {
  visibleDays: string[];
  markersByDate: Map<string, PlannerCompletionFactMarker[]>;
  loading: boolean;
}) {
  const theme = useTheme();
  return (
    <>
      <View
        style={[
          styles.readOnlyBanner,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
        ]}
      >
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Partner completions (view only)
        </Text>
      </View>
      {loading ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Loading partner completions...
        </Text>
      ) : null}
      {visibleDays.map((visibleDay) => (
        <View
          key={visibleDay}
          style={[styles.dayCard, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {visibleDay}
          </Text>
          {(markersByDate.get(visibleDay) ?? []).map((marker) => (
            <View
              key={marker.key}
              accessible
              accessibilityRole="text"
              accessibilityLabel={buildPartnerMarkerAccessibilityLabel(marker.goalTitle)}
              style={[
                styles.partnerMarker,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.secondary,
                },
              ]}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                Partner marked this done: {marker.goalTitle}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  readOnlyBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dayCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  partnerMarker: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
