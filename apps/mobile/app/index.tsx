import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { mobileEnv } from "../src/config/env";
import { supabase } from "../src/lib/supabase";

type XpProfileResponse = {
  schemaVersion: "1";
  correlationId: string;
  profile: {
    totalXp: number;
    currentLevel: number;
  };
};

async function fetchXpProfile(signal?: AbortSignal): Promise<XpProfileResponse> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("Missing authenticated session.");
  }

  const response = await fetch(`${mobileEnv.apiBaseUrl}/api/xp/profile`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    signal,
  });

  const payload = (await response.json()) as XpProfileResponse | { message?: string };
  if (!response.ok) {
    throw new Error((payload as { message?: string }).message ?? "XP profile request failed.");
  }

  return payload as XpProfileResponse;
}

export default function TracerBulletScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("Sign in, then load XP profile.");
  const [xpProfile, setXpProfile] = useState<XpProfileResponse | null>(null);

  const isSignedIn = useMemo(() => Boolean(sessionToken), [sessionToken]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setMessage("Signing in...");
    setXpProfile(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session?.access_token) {
        throw error ?? new Error("Session was not returned.");
      }
      setSessionToken(data.session.access_token);
      setMessage("Signed in. Ready to call /api/xp/profile.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      setSessionToken(null);
      setXpProfile(null);
      setMessage("Signed out.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadXpProfile = useCallback(async () => {
    setBusy(true);
    setMessage("Calling /api/xp/profile...");
    try {
      const payload = await fetchXpProfile();
      setXpProfile(payload);
      setMessage("Tracer bullet succeeded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "XP profile request failed.");
      setXpProfile(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Cadence RN Tracer Bullet</Text>
        <Text style={styles.subtitle}>Sign in and hit one authenticated API endpoint.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="alice@example.com"
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="password123"
            style={styles.input}
          />
          <Pressable
            disabled={busy || email.trim().length === 0 || password.length === 0}
            style={styles.button}
            onPress={signIn}
          >
            <Text style={styles.buttonText}>Sign In</Text>
          </Pressable>
          <Pressable disabled={busy || !isSignedIn} style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.secondaryButtonText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Pressable disabled={busy || !isSignedIn} style={styles.button} onPress={loadXpProfile}>
            <Text style={styles.buttonText}>Load XP Profile</Text>
          </Pressable>
          <Text style={styles.message}>{message}</Text>
          {busy ? <ActivityIndicator /> : null}
          {xpProfile ? (
            <Text style={styles.result}>
              Level {xpProfile.profile.currentLevel} · {xpProfile.profile.totalXp} XP
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0b0d10" },
  container: { padding: 20, gap: 16 },
  title: { color: "#f4f6fb", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#a1a8b8", fontSize: 14 },
  card: {
    backgroundColor: "#171a22",
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#2a3040",
  },
  label: { color: "#d7dcee", fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#394158",
    borderRadius: 8,
    color: "#f4f6fb",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: "#4b82ff",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontWeight: "700" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#4b82ff",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#8fb1ff", fontWeight: "600" },
  message: { color: "#d7dcee" },
  result: { color: "#7ce9aa", fontWeight: "600" },
});
