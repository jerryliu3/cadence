import { type ReactNode } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getMobileTheme } from "../theme";

export function Screen({
  title,
  children,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const theme = getMobileTheme();
  const body = (
    <View style={styles.body}>
      <Text style={[styles.title, { color: theme.colors.foreground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function LoadingScreen() {
  const theme = getMobileTheme();
  return (
    <SafeAreaView
      style={[styles.safe, styles.center, { backgroundColor: theme.colors.background }]}
    >
      <ActivityIndicator />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20 },
  body: { gap: 12, padding: 20, flex: 1 },
  title: { fontSize: 24, fontWeight: "700" },
});
