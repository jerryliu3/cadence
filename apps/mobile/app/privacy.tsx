import { Link } from "expo-router";
import { Text } from "react-native";
import { Screen } from "../src/ui/screen";
import { useTheme } from "../src/theme";

export default function PrivacyScreen() {
  const theme = useTheme();
  return (
    <Screen title="Privacy">
      <Text style={{ color: theme.colors.foreground }}>
        Cadence reads on-device health data from Apple Health and Health Connect
        only to help you schedule and complete your own goals. We do not show
        raw health values on social, duo, or leaderboard surfaces.
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        You can disconnect a provider in Settings. Disconnecting deletes that
        provider&apos;s stored samples on our servers.
      </Text>
      <Link href="/(tabs)/settings" style={{ color: theme.colors.foreground }}>
        Back to settings
      </Link>
    </Screen>
  );
}
