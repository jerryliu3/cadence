import { APP_TABS } from "@cadence/shared/navigation/tabs";
import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useForceUpgradeRequired } from "../../src/lib/runtime-config";
import { useSession } from "../../src/lib/session";
import { useTheme } from "../../src/theme";
import { LoadingScreen } from "../../src/ui/screen";

const TAB_ICONS: Record<string, string> = {
  insights: "◉",
  checklist: "☑",
  calendar: "▦",
  social: "⚑",
  settings: "☺",
};

export default function TabsLayout() {
  const { ready, session } = useSession();
  const upgrade = useForceUpgradeRequired();
  const theme = useTheme();

  if (!ready || upgrade.loading) {
    return <LoadingScreen />;
  }
  if (upgrade.required) {
    return <Redirect href="/upgrade" />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        tabBarStyle: { backgroundColor: theme.colors.card },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
      }}
    >
      {APP_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.key}
          name={tab.key}
          options={{
            title: tab.label,
            href: tab.key === "social" && upgrade.flags && !upgrade.flags.socialEnabled
              ? null
              : undefined,
            tabBarIcon: ({ color }) => (
              <Text style={{ color, fontSize: 16 }}>{TAB_ICONS[tab.key]}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
