import { addMonths, format, isValid, parse } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId,
  plannerErrorResponse,
  PlannerRouteError,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";

export const runtime = "nodejs";

const MAX_WINDOW_MONTHS = 24;

const scopeMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => {
    const monthNumber = Number(month.slice(5, 7));
    return monthNumber >= 1 && monthNumber <= 12;
  }, "Invalid scope month.");

const querySchema = z.object({
  scopeMonth: scopeMonthSchema,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});

interface VisibleMonthContextPayload {
  scopeMonth: string;
  goalTitles: Record<string, string>;
  activePlan: unknown;
  preview: unknown;
}

function parseScopeMonthDate(scopeMonth: string) {
  return parse(`${scopeMonth}-01`, "yyyy-MM-dd", new Date());
}

function listMonthsInWindow(startDate: string, endDate: string) {
  const startMonth = parseScopeMonthDate(startDate.slice(0, 7));
  const endMonth = parseScopeMonthDate(endDate.slice(0, 7));
  if (!isValid(startMonth) || !isValid(endMonth) || startMonth > endMonth) {
    return [];
  }
  const months: string[] = [];
  let cursor = startMonth;
  while (cursor <= endMonth) {
    months.push(format(cursor, "yyyy-MM"));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

function buildForwardedHeaders(request: Request) {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return headers;
}

function coerceVisibleMonthContext(
  payload: unknown
): VisibleMonthContextPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const parsed = payload as {
    scopeMonth?: unknown;
    goalTitles?: unknown;
    activePlan?: unknown;
    preview?: unknown;
  };
  if (typeof parsed.scopeMonth !== "string") {
    return null;
  }
  const goalTitles =
    parsed.goalTitles &&
    typeof parsed.goalTitles === "object" &&
    !Array.isArray(parsed.goalTitles)
      ? (parsed.goalTitles as Record<string, string>)
      : {};
  return {
    scopeMonth: parsed.scopeMonth,
    goalTitles,
    activePlan: parsed.activePlan ?? null,
    preview: parsed.preview ?? null,
  };
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      scopeMonth: url.searchParams.get("scopeMonth") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Provide a valid scope month and visible window date range."
      );
    }
    const { scopeMonth, startDate, endDate } = parsedQuery.data;
    if (startDate > endDate) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Visible window start date must be on or before end date."
      );
    }

    const monthsInWindow = listMonthsInWindow(startDate, endDate);
    if (monthsInWindow.length === 0) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Visible window months could not be resolved."
      );
    }
    if (monthsInWindow.length > MAX_WINDOW_MONTHS) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Visible window spans too many months.",
        {
          maximumMonths: MAX_WINDOW_MONTHS,
          monthCount: monthsInWindow.length,
        }
      );
    }

    const visibleMonths = monthsInWindow.filter((month) => month !== scopeMonth);
    const contextsByMonth =
      visibleMonths.length === 0
        ? {}
        : Object.fromEntries(
            await Promise.all(
              visibleMonths.map(async (visibleMonth) => {
                const contextUrl = new URL("/api/planner/context", url.origin);
                contextUrl.searchParams.set("scopeMonth", visibleMonth);
                const response = await fetch(contextUrl, {
                  method: "GET",
                  headers: buildForwardedHeaders(request),
                  cache: "no-store",
                });
                let payload: unknown = null;
                try {
                  payload = await response.json();
                } catch {
                  payload = null;
                }
                if (!response.ok) {
                  const message =
                    payload &&
                    typeof payload === "object" &&
                    "message" in payload &&
                    typeof payload.message === "string"
                      ? payload.message
                      : "Planner calendar context could not be loaded.";
                  throw new PlannerRouteError(
                    response.status,
                    "visible_context_fetch_failed",
                    message,
                    { scopeMonth: visibleMonth }
                  );
                }
                const visibleMonthContext = coerceVisibleMonthContext(payload);
                if (!visibleMonthContext) {
                  throw new PlannerRouteError(
                    500,
                    "invariant_failed",
                    "Visible month context payload was malformed.",
                    { scopeMonth: visibleMonth }
                  );
                }
                return [visibleMonth, visibleMonthContext] as const;
              })
            )
          );

    return NextResponse.json(
      {
        schemaVersion: "1",
        scopeMonth,
        window: {
          startDate,
          endDate,
        },
        contextsByMonth,
        correlationId,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
