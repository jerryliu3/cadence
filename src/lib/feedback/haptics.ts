import { configureLightPressHaptics } from "@cadence/shared/feedback/haptics";

const LIGHT_PRESS_DURATION_MS = 8;

function webLightPressHaptics(): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }

  try {
    return navigator.vibrate(LIGHT_PRESS_DURATION_MS);
  } catch {
    return false;
  }
}

configureLightPressHaptics(webLightPressHaptics);

export { triggerLightPressFeedback } from "@cadence/shared/feedback/haptics";
