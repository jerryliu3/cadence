import { Text } from "react-native";
import { useForceUpgradeRequired } from "../../src/lib/runtime-config";
import { Screen } from "../../src/ui/screen";

export default function SocialPlaceholder() {
  const { flags } = useForceUpgradeRequired();
  return (
    <Screen title="Challenges">
      <Text>
        {flags?.socialEnabled
          ? "Social feed and challenges land in the social slice."
          : "Social is currently disabled for this environment."}
      </Text>
    </Screen>
  );
}
