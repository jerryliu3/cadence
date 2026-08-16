import type { DuoSurfaceName } from "@cadence/shared/social/duo";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import { useDuoSurfaceScope } from "./DuoProvider";

const OPTIONS = [
  { label: "Solo", value: "me" as const },
  { label: "Partner", value: "partner" as const },
  { label: "Duo", value: "both" as const },
];

export function DuoScopeSegmentedControl({
  surface,
}: {
  surface: DuoSurfaceName;
}) {
  const theme = useTheme();
  const { hasActivePartner, scope, setScopePreference } = useDuoSurfaceScope(surface);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!hasActivePartner) {
    return null;
  }

  const selectedLabel = OPTIONS.find((option) => option.value === scope)?.label ?? "Solo";

  return (
    <View style={styles.container}>
      <View style={[styles.wrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose partner view"
          accessibilityState={{ expanded: open }}
          style={styles.trigger}
          onPress={() => setOpen((value) => !value)}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {selectedLabel} {open ? "▲" : "▼"}
          </Text>
        </Pressable>
        {open ? (
          <View style={[styles.menu, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
            {OPTIONS.map((option) => {
              const selected = scope === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="menuitem"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected ? theme.colors.accent : "transparent",
                    },
                  ]}
                  onPress={() => {
                    void setScopePreference(option.value)
                      .then(() => {
                        setSaveError(null);
                        setOpen(false);
                      })
                      .catch(() => {
                        setSaveError("Could not save scope preference.");
                      });
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.foreground,
                      fontWeight: selected ? "700" : "500",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      {saveError ? (
        <Text style={{ color: theme.colors.destructive, fontWeight: "600" }}>{saveError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  wrap: {
    alignSelf: "flex-start",
    minWidth: 108,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    gap: 8,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  menu: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  option: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
});
