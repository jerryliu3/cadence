import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";

export function InsightsLaneSection({
  showHeading,
  headingLabel,
  readOnly,
  tone,
  message,
  children,
}: {
  showHeading: boolean;
  headingLabel: string;
  readOnly: boolean;
  tone?: "muted" | "destructive";
  message?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {showHeading ? (
        <View style={styles.headingRow}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {headingLabel}
          </Text>
          {readOnly ? (
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
      ) : null}
      {message ? (
        <Text
          style={{
            color:
              tone === "destructive"
                ? theme.colors.destructive
                : theme.colors.mutedForeground,
          }}
        >
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
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
