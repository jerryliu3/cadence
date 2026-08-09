import { NextResponse } from "next/server";

interface NoStoreErrorResponseOptions {
  status: number;
  code: string;
  message: string;
  correlationId: string;
  extraHeaders?: Record<string, string>;
}

export function noStoreErrorResponse({
  status,
  code,
  message,
  correlationId,
  extraHeaders,
}: NoStoreErrorResponseOptions) {
  return NextResponse.json(
    { code, message, correlationId },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(extraHeaders ?? {}),
      },
    }
  );
}
