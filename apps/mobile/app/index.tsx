import { Redirect } from "expo-router";
import { useForceUpgradeRequired } from "../src/lib/runtime-config";
import { useSession } from "../src/lib/session";
import { LoadingScreen } from "../src/ui/screen";

export default function IndexRoute() {
  const { ready, session } = useSession();
  const upgrade = useForceUpgradeRequired();

  if (!ready || upgrade.loading) {
    return <LoadingScreen />;
  }
  if (upgrade.required) {
    return <Redirect href="/upgrade" />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Redirect href="/(tabs)/checklist" />;
}
