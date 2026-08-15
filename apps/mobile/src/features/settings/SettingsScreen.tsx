import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { supabase } from "../../lib/supabase";
import { registerNativePush, subscribeNotificationOpens } from "../../lib/push";
import { useSession } from "../../lib/session";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { Screen } from "../../ui/screen";

interface NotificationSchedule {
  id: string;
  hour: number;
  timezone: string;
  message: string;
  enabled: boolean;
}

export function SettingsScreen() {
  const theme = useTheme();
  const { session, userId } = useSession();
  const queryClient = useQueryClient();
  const [hour, setHour] = useState("18");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeNotificationOpens((url) => {
      router.push((url.startsWith("/") ? url : `/${url}`) as Href);
    });
  }, []);

  const schedules = useQuery({
    queryKey: ["mobile-notification-schedules", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_schedules")
        .select("id,hour,timezone,message,enabled")
        .eq("user_id", userId ?? "")
        .order("hour");
      if (error) {
        throw error;
      }
      return (data ?? []) as NotificationSchedule[];
    },
  });

  return (
    <Screen title="Profile">
      <Text style={{ color: theme.colors.foreground }}>{session?.user.email}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>Reminder hour (0-23)</Text>
      <TextInput
        keyboardType="number-pad"
        value={hour}
        onChangeText={setHour}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          color: theme.colors.foreground,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <PrimaryButton
        label="Save reminder"
        onPress={async () => {
          if (!userId) {
            return;
          }
          const parsedHour = Number(hour);
          const { error } = await supabase.from("notification_schedules").insert({
            user_id: userId,
            hour: parsedHour,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            message: "Complete your checklist for today",
            enabled: true,
          });
          setMessage(error ? error.message : "Reminder saved.");
          await queryClient.invalidateQueries({
            queryKey: ["mobile-notification-schedules"],
          });
        }}
      />
      {(schedules.data ?? []).map((schedule) => (
        <Text key={schedule.id} style={{ color: theme.colors.foreground }}>
          {schedule.hour}:00 · {schedule.timezone}
        </Text>
      ))}
      <PrimaryButton
        label="Enable push"
        onPress={async () => {
          try {
            await registerNativePush();
            setMessage("This device is registered for push.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Push registration failed.");
          }
        }}
      />
      <PrimaryButton
        label="Sign out"
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        }}
      />
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
    </Screen>
  );
}
