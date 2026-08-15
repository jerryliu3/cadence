import { Text } from "react-native";
import { useForceUpgradeRequired } from "../src/lib/runtime-config";
import { Screen } from "../src/ui/screen";

export default function UpgradeScreen() {
  const { minSupportedAppVersion } = useForceUpgradeRequired();
  return (
    <Screen title="Update required">
      <Text>
        This Cadence build is below the minimum supported version
        {minSupportedAppVersion ? ` (${minSupportedAppVersion})` : ""}. Update
        the app to continue.
      </Text>
    </Screen>
  );
}
