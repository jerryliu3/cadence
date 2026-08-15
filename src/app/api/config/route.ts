import { NextResponse } from "next/server";
import { createCorrelationId } from "@/lib/api/route";
import { getFeatureFlags } from "@/lib/feature-flags";

export const runtime = "nodejs";

function readMinSupportedAppVersion() {
  const value = process.env.MOBILE_MIN_SUPPORTED_APP_VERSION?.trim();
  return value && value.length > 0 ? value : null;
}

export async function GET() {
  const correlationId = createCorrelationId();
  const flags = getFeatureFlags();

  return NextResponse.json(
    {
      schemaVersion: "1",
      flags,
      minSupportedAppVersion: readMinSupportedAppVersion(),
      correlationId,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
