import { darkTheme, lightTheme, motionDurations, radius } from "@cadence/shared/tokens";
import { Appearance } from "react-native";

export function getMobileTheme() {
  const scheme = Appearance.getColorScheme();
  const colors = scheme === "light" ? lightTheme : darkTheme;
  return {
    colors: Object.fromEntries(
      Object.entries(colors).map(([key, token]) => [key, token.hex])
    ) as Record<keyof typeof darkTheme, string>,
    radius,
    motionDurations,
  };
}
