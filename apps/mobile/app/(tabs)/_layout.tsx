import { buildAppTabs } from "@cadence/shared/navigation/tabs";
import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useForceUpgradeRequired } from "../../src/lib/runtime-config";
import { useSession } from "../../src/lib/session";
import { useProfileNavigationPreferences } from "../../src/lib/navigation-preferences";
import { DuoProvider } from "../../src/features/duo/DuoProvider";
import { useTheme } from "../../src/theme";
import { LoadingScreen } from "../../src/ui/screen";

const TAB_ICONS: Record<string, string> = {
  insights: "◉",
  checklist: "☑",
  calendar: "▦",
  social: "⚑",
  settings: "☺",
};

function withHexAlpha(color: string, alpha: number) {
  if (!color.startsWith("#") || color.length !== 7) {
    return color;
  }
  const channel = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `${color}${channel.toString(16).padStart(2, "0")}`;
}

export default function TabsLayout() {
  const { ready, session } = useSession();
  const upgrade = useForceUpgradeRequired();
  const theme = useTheme();
  const preferences = useProfileNavigationPreferences(session?.user.id ?? null);
  const tabs = buildAppTabs(preferences.plannerPrimaryTabPreference);

  if (!ready || upgrade.loading || (session && preferences.loading)) {
    return <LoadingScreen />;
  }
  if (upgrade.required) {
    return <Redirect href="/upgrade" />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <DuoProvider>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.foreground,
          tabBarStyle: { backgroundColor: withHexAlpha(theme.colors.card, 0.5) },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.mutedForeground,
        }}
      >
        {tabs.map((tab) => (
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
        <Tabs.Screen name="checklist" options={{ href: null }} />
      </Tabs>
    </DuoProvider>
  );
}
