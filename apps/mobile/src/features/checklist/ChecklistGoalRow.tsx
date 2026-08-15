import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";

export function ChecklistGoalRow({
  title,
  category,
  done,
  interactive,
  readOnlyReason,
  href,
  onToggle,
  toggling = false,
}: {
  title: string;
  category: string;
  done: boolean;
  interactive: boolean;
  readOnlyReason?: string;
  href?: Href;
  onToggle: () => void;
  toggling?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
      ]}
    >
      {interactive ? (
        <Pressable
          disabled={toggling}
          onPress={onToggle}
          style={[
            styles.toggle,
            {
              backgroundColor: done ? theme.colors.primary : theme.colors.secondary,
            },
          ]}
        >
          <Text style={{ color: theme.colors.primaryForeground }}>{done ? "✓" : ""}</Text>
        </Pressable>
      ) : (
        <View
          style={[
            styles.readOnlyStatus,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.secondary,
            },
          ]}
        >
          <Text style={{ color: theme.colors.mutedForeground }}>{done ? "✓" : ""}</Text>
        </View>
      )}
      {interactive && href ? (
        <Link href={href} style={styles.titleWrap}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>{title}</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>{category}</Text>
        </Link>
      ) : (
        <View style={styles.titleWrap}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>{title}</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>{category}</Text>
          {readOnlyReason ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              {readOnlyReason}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  readOnlyStatus: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1, gap: 2 },
});
