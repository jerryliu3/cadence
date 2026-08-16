import { Redirect } from "expo-router";
import { resolveMobileDefaultMainPageHref } from "../src/lib/navigation-preference-routes";
import { useProfileNavigationPreferences } from "../src/lib/navigation-preferences";
import { useForceUpgradeRequired } from "../src/lib/runtime-config";
import { useSession } from "../src/lib/session";
import { LoadingScreen } from "../src/ui/screen";

export default function IndexRoute() {
  const { ready, session } = useSession();
  const upgrade = useForceUpgradeRequired();
  const preferences = useProfileNavigationPreferences(session?.user.id ?? null);

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
    <Redirect
      href={resolveMobileDefaultMainPageHref(preferences.defaultMainPagePreference)}
    />
  );
}
