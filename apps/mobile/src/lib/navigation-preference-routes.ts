import {
  resolveDefaultMainPageHref,
  type DefaultMainPagePreference,
} from "@cadence/shared/navigation/tabs";

export function resolveMobileDefaultMainPageHref(
  preference: DefaultMainPagePreference
):
  | "/(tabs)/calendar"
  | "/(tabs)/checklist"
  | "/(tabs)/insights" {
  switch (resolveDefaultMainPageHref(preference)) {
    case "/checklist":
      return "/(tabs)/checklist";
    case "/insights":
      return "/(tabs)/insights";
    case "/calendar":
    default:
      return "/(tabs)/calendar";
  }
}
