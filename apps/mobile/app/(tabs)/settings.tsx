import { router } from "expo-router";
import { Text } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/lib/session";
import { PrimaryButton } from "../../src/ui/button";
import { Screen } from "../../src/ui/screen";

export default function SettingsScreen() {
  const { session } = useSession();
  return (
    <Screen title="Profile">
      <Text>{session?.user.email ?? "Signed in"}</Text>
      <PrimaryButton
        label="Sign out"
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        }}
      />
    </Screen>
  );
}
