import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/lib/session";
import { useTheme } from "../../src/theme";
import { PrimaryButton } from "../../src/ui/button";
import { Screen } from "../../src/ui/screen";

export default function LoginScreen() {
  const { session, ready } = useSession();
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (ready && session) {
    return <Redirect href="/(tabs)/checklist" />;
  }

  return (
    <Screen title="Sign in">
      <Text style={{ color: theme.colors.mutedForeground }}>
        Cadence mobile uses the same account as the web app.
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor={theme.colors.mutedForeground}
        value={email}
        onChangeText={setEmail}
        style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
      />
      <TextInput
        secureTextEntry
        placeholder="Password"
        placeholderTextColor={theme.colors.mutedForeground}
        value={password}
        onChangeText={setPassword}
        style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
      />
      <PrimaryButton
        disabled={busy || email.trim().length === 0 || password.length === 0}
        label={busy ? "Signing in..." : "Sign in"}
        onPress={async () => {
          setBusy(true);
          setMessage(null);
          const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          setBusy(false);
          if (error) {
            setMessage(error.message);
            return;
          }
          router.replace("/(tabs)/checklist");
        }}
      />
      {message ? (
        <Text style={{ color: theme.colors.destructive }}>{message}</Text>
      ) : null}
      <View style={styles.links}>
        <Link href="/(auth)/signup" style={{ color: theme.colors.primary }}>
          Create account
        </Link>
        <Link href="/(auth)/reset-password" style={{ color: theme.colors.primary }}>
          Reset password
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  links: { gap: 8, marginTop: 8 },
});
