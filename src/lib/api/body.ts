import { z } from "zod";
import { RouteError } from "@/lib/api/errors";

export async function parseBoundedJsonBody<T>(
  request: Request,
  maxBytes: number,
  schema: z.ZodType<T>
) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RouteError(
      413,
      "request_too_large",
      "The request body is too large."
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    throw new RouteError(
      413,
      "request_too_large",
      "The request body is too large."
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new RouteError(
      400,
      "invalid_json",
      "Request body must be valid JSON."
    );
  }

  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) {
    throw new RouteError(
      400,
      "validation_failed",
      "Request payload failed validation.",
      { issues: parsed.error.issues }
    );
  }

  return parsed.data;
}
