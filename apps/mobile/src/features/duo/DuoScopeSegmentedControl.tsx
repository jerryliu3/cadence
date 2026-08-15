import type { DuoSurfaceName } from "@cadence/shared/social/duo";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import { useDuoSurfaceScope } from "./DuoProvider";

const OPTIONS = [
  { label: "Mine", value: "me" as const },
  { label: "Partner", value: "partner" as const },
  { label: "Both", value: "both" as const },
];

export function DuoScopeSegmentedControl({
  surface,
}: {
  surface: DuoSurfaceName;
}) {
  const theme = useTheme();
  const { hasActivePartner, scope, setScopePreference } = useDuoSurfaceScope(surface);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!hasActivePartner) {
    return null;
  }

  return (
    <View style={[styles.wrap, { borderColor: theme.colors.border }]}>
      {OPTIONS.map((option) => {
        const selected = scope === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              {
                backgroundColor: selected ? theme.colors.primary : theme.colors.secondary,
              },
            ]}
            onPress={() => {
              void setScopePreference(option.value)
                .then(() => {
                  setSaveError(null);
                })
                .catch(() => {
                  setSaveError("Could not save scope preference.");
                });
            }}
          >
            <Text
              style={{
                color: selected
                  ? theme.colors.primaryForeground
                  : theme.colors.secondaryForeground,
                fontWeight: "700",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
      {saveError ? (
        <Text style={{ color: theme.colors.destructive, fontWeight: "600" }}>{saveError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
});
