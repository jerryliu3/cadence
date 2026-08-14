import { FlashList } from "@shopify/flash-list";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getMobileTheme } from "../../theme";
import { LoadingScreen, Screen } from "../../ui/screen";
import { useChecklistData } from "./use-checklist-data";

export function ChecklistScreen() {
  const theme = getMobileTheme();
  const { loading, error, goals, completedToday, toggle, asOfDate } =
    useChecklistData();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Screen title="Checklist" scroll={false}>
      <Text style={{ color: theme.colors.mutedForeground }}>{asOfDate}</Text>
      <Link href="/goals/new" style={{ color: theme.colors.primary, fontWeight: "700" }}>
        New goal
      </Link>
      {error ? (
        <Text style={{ color: theme.colors.destructive }}>
          {error instanceof Error ? error.message : "Could not load checklist."}
        </Text>
      ) : null}
      <FlashList
        data={goals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const done = completedToday.has(item.id);
          return (
            <View
              style={[
                styles.row,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
              ]}
            >
              <Pressable
                onPress={() =>
                  void toggle({
                    goalId: item.id,
                    desiredFactState: done ? "absent" : "present",
                  })
                }
                style={[
                  styles.toggle,
                  {
                    backgroundColor: done
                      ? theme.colors.primary
                      : theme.colors.secondary,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.primaryForeground }}>
                  {done ? "✓" : ""}
                </Text>
              </Pressable>
              <Link href={`/goals/${item.id}`} style={styles.titleWrap}>
                <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                  {item.title}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground }}>
                  {item.category}
                </Text>
              </Link>
            </View>
          );
        }}
      />
    </Screen>
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
    marginBottom: 8,
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1 },
});
