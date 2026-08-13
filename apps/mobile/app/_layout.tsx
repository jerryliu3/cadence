import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppQueryProvider } from "../src/lib/query";
import { SessionProvider } from "../src/lib/session";
import { initMobileSentry } from "../src/lib/sentry";
import "../src/lib/haptics";

initMobileSentry();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <AppQueryProvider>
            <SessionProvider>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="upgrade" />
                <Stack.Screen
                  name="goals/new"
                  options={{ presentation: "formSheet", headerShown: true, title: "New goal" }}
                />
                <Stack.Screen
                  name="goals/[id]"
                  options={{ presentation: "formSheet", headerShown: true, title: "Edit goal" }}
                />
              </Stack>
            </SessionProvider>
          </AppQueryProvider>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
