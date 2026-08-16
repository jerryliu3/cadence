import { NextResponse } from "next/server";
import { withRoute } from "@/lib/api/route";
import { getServerEnv } from "@/lib/env";
import { getFeatureFlags } from "@/lib/feature-flags";

export const runtime = "nodejs";

function publicMobileFlags() {
  const flags = getFeatureFlags();
  return {
    crossMonthMovesEnabled: flags.crossMonthMovesEnabled,
    xpEnabled: flags.xpEnabled,
    socialEnabled: flags.socialEnabled,
    integrationsEnabled: flags.integrationsEnabled,
    journeyEnabled: flags.journeyEnabled,
    journeyVideoEnabled: flags.journeyVideoEnabled,
    journeyRiveEnabled: flags.journeyRiveEnabled,
    journeySocialOverlayEnabled: flags.journeySocialOverlayEnabled,
    journeyAssetManifestVersion: flags.journeyAssetManifestVersion,
  };
}

export async function GET() {
  return withRoute(async () => {
    const env = getServerEnv();
    return NextResponse.json(
      {
        schemaVersion: "1",
        flags: publicMobileFlags(),
        minSupportedAppVersion: env.MOBILE_MIN_SUPPORTED_APP_VERSION ?? null,
        integrationsRolloutStage: env.INTEGRATIONS_ROLLOUT_STAGE,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  });
}
