import { darkTheme, lightTheme, motionDurations, radius } from "@cadence/shared/tokens";
import { useColorScheme } from "react-native";

const themes = {
  light: {
    colors: lightTheme,
    radius,
    motionDurations,
  },
  dark: {
    colors: darkTheme,
    radius,
    motionDurations,
  },
} as const;

export function useTheme() {
  const scheme = useColorScheme();
  return themes[scheme === "light" ? "light" : "dark"];
}
