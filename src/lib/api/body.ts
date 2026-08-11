import { z } from "zod";
import { ApiRouteError, parseJsonBody } from "@/lib/api/route";
import { RouteError } from "@/lib/api/errors";

export async function parseBoundedJsonBody<T>(
  request: Request,
  maxBytes: number,
  schema: z.ZodType<T>
) {
  try {
    return await parseJsonBody({
      request,
      maxBytes,
      schema,
    });
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw new RouteError(
        error.status,
        error.code,
        error.message,
        error.details
      );
    }
    throw error;
  }
}
