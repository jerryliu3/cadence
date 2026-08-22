import { Link, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/theme";
import { PrimaryButton } from "../../src/ui/button";
import { Screen } from "../../src/ui/screen";

export default function SignupScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Screen title="Create account">
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
        disabled={busy || email.trim().length === 0 || password.length < 8}
        label={busy ? "Creating..." : "Sign up"}
        onPress={async () => {
          setBusy(true);
          setMessage(null);
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                seed_default_goals: true,
              },
            },
          });
          setBusy(false);
          if (error) {
            setMessage(error.message);
            return;
          }
          if (data.session) {
            router.replace("/(tabs)/checklist");
            return;
          }
          setMessage("Account created. Check your email to confirm if required.");
          router.replace("/(auth)/login");
        }}
      />
      {message ? (
        <Text style={{ color: theme.colors.destructive }}>{message}</Text>
      ) : null}
      <Link href="/(auth)/login" style={{ color: theme.colors.primary }}>
        Already have an account
      </Link>
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
});
