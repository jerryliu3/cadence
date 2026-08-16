import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarScreen } from "../calendar/CalendarScreen";
import { ChecklistScreen } from "../checklist/ChecklistScreen";
import { useTheme } from "../../theme";

type PlannerSurface = "calendar" | "checklist";

export function PlannerScreen() {
  const params = useLocalSearchParams<{ surface?: string }>();
  const [surface, setSurface] = useState<PlannerSurface>(
    params.surface === "checklist" ? "checklist" : "calendar"
  );
  const theme = useTheme();
  const navigation = (
    <View style={styles.tabs}>
      {(["calendar", "checklist"] as const).map((option) => {
        const selected = surface === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.tab,
              {
                borderColor: selected
                  ? theme.colors.primary
                  : theme.colors.border,
                backgroundColor: selected
                  ? theme.colors.primary
                  : theme.colors.card,
              },
            ]}
            onPress={() => setSurface(option)}
          >
            <Text
              style={{
                color: selected
                  ? theme.colors.background
                  : theme.colors.foreground,
                fontWeight: "700",
              }}
            >
              {option === "calendar" ? "Calendar" : "Checklist"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return surface === "calendar" ? (
    <CalendarScreen plannerNavigation={navigation} />
  ) : (
    <ChecklistScreen plannerNavigation={navigation} />
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
  },
});
