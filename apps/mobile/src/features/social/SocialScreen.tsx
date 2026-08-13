import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { api } from "../../lib/api";
import { useForceUpgradeRequired } from "../../lib/runtime-config";
import { getMobileTheme } from "../../theme";
import { LoadingScreen, Screen } from "../../ui/screen";

interface SocialFeedResponse {
  events?: Array<{ id: string; type?: string; createdAt?: string }>;
  items?: Array<{ id: string; type?: string }>;
}

export function SocialScreen() {
  const theme = getMobileTheme();
  const { flags } = useForceUpgradeRequired();
  const enabled = flags?.socialEnabled ?? false;
  const query = useQuery({
    queryKey: ["mobile-social-feed"],
    enabled,
    queryFn: () => api.getJson<SocialFeedResponse>("/api/social/feed"),
  });

  if (!enabled) {
    return (
      <Screen title="Challenges">
        <Text style={{ color: theme.colors.mutedForeground }}>
          Social is disabled for this environment.
        </Text>
      </Screen>
    );
  }

  if (query.isLoading) {
    return <LoadingScreen />;
  }

  const events = query.data?.events ?? query.data?.items ?? [];
  return (
    <Screen title="Challenges">
      {events.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>No feed events yet.</Text>
      ) : (
        events.map((event) => (
          <Text key={event.id} style={{ color: theme.colors.foreground }}>
            {event.type ?? "event"}
          </Text>
        ))
      )}
    </Screen>
  );
}
