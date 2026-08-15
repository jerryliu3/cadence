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
  };
}

export async function GET() {
  return withRoute(async ({ correlationId }) => {
    const env = getServerEnv();
    return NextResponse.json(
      {
        schemaVersion: "1",
        flags: publicMobileFlags(),
        minSupportedAppVersion: env.MOBILE_MIN_SUPPORTED_APP_VERSION ?? null,
        correlationId,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  });
}
