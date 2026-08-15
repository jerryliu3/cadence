import { ApiRouteError } from "@/lib/api/route";

export function integrationsDisabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}
