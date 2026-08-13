import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { api } from "./api";
import { isAppVersionBelowFloor } from "./version";

export interface MobileRuntimeConfig {
  schemaVersion: "1";
  flags: {
    crossMonthMovesEnabled: boolean;
    xpEnabled: boolean;
    socialEnabled: boolean;
  };
  minSupportedAppVersion: string | null;
  correlationId: string;
}

export function useMobileRuntimeConfig() {
  return useQuery({
    queryKey: ["mobile-runtime-config"],
    queryFn: () => api.getJson<MobileRuntimeConfig>("/api/config"),
    staleTime: 60_000,
  });
}

export function useForceUpgradeRequired() {
  const config = useMobileRuntimeConfig();
  const currentVersion = Constants.expoConfig?.version ?? "1.0.0";
  return {
    loading: config.isLoading,
    required: isAppVersionBelowFloor(
      currentVersion,
      config.data?.minSupportedAppVersion ?? null
    ),
    minSupportedAppVersion: config.data?.minSupportedAppVersion ?? null,
    flags: config.data?.flags,
  };
}
