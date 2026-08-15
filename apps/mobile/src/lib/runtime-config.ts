import { useQuery } from "@tanstack/react-query";
import type { FeatureFlags } from "@cadence/shared/feature-flags";
import Constants from "expo-constants";
import { api } from "./api";
import { isAppVersionBelowFloor } from "./version";

export interface MobileRuntimeConfig {
  schemaVersion: "1";
  flags: FeatureFlags;
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
  const currentVersion = Constants.expoConfig?.version;
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
