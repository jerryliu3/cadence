import { router } from "expo-router";
import { useEffect } from "react";
import { Linking } from "react-native";
import {
  HEALTH_PRIVACY_PATH,
  shouldOpenHealthPrivacyPolicy,
} from "./privacy-policy-intent";

export function HealthPrivacyIntentHandler() {
  useEffect(() => {
    const openPolicy = (url: string) => {
      if (shouldOpenHealthPrivacyPolicy(url)) {
        router.replace(HEALTH_PRIVACY_PATH);
      }
    };

    const subscription = Linking.addEventListener("url", (event) => {
      openPolicy(event.url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) {
        openPolicy(url);
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}
