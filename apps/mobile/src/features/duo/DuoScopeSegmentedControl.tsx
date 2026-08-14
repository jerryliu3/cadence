import type { DuoSurfaceName } from "@cadence/shared/social/duo";
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
            style={[
              styles.segment,
              {
                backgroundColor: selected ? theme.colors.primary : theme.colors.secondary,
              },
            ]}
            onPress={() => {
              void setScopePreference(option.value);
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
