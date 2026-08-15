import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { mobileEnv } from "../../src/config/env";
import { buildPasswordRecoveryRedirect } from "../../src/lib/password-recovery";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/theme";
import { PrimaryButton } from "../../src/ui/button";
import { Screen } from "../../src/ui/screen";

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Screen title="Reset password">
      <Text style={{ color: theme.colors.mutedForeground }}>
        We will email a link to the secure web password form. Return here to
        sign in after changing your password.
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
      <PrimaryButton
        disabled={busy || email.trim().length === 0}
        label={busy ? "Sending..." : "Send reset email"}
        onPress={async () => {
          setBusy(true);
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: buildPasswordRecoveryRedirect(mobileEnv.apiBaseUrl),
          });
          setBusy(false);
          setMessage(
            error
              ? error.message
              : "Check your email, complete the web form, then return to sign in."
          );
        }}
      />
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
      <Link href="/(auth)/login" style={{ color: theme.colors.primary }}>
        Back to sign in
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
