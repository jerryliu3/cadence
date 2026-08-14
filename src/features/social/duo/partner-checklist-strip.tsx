"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toLocalDateString } from "@/lib/dates/day";
import {
  fetchProgressContext,
  isProgressContextAuthenticationError,
  isProgressContextRequestError,
} from "@/lib/goals/progress-context";
import type { DuoActivePartner } from "@cadence/shared/social/duo";
import { reportDuoPartnerFetchFailure, reportDuoTelemetry } from "@/lib/social/duo/telemetry";

export function PartnerChecklistStrip({
  partner,
  viewDate,
  onOpenPartner,
}: {
  partner: DuoActivePartner;
  viewDate: string;
  onOpenPartner: () => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "unavailable" }
    | { status: "ready"; completionCount: number; goalCount: number }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const progress = await fetchProgressContext({
          asOfDate: toLocalDateString(),
          viewDate,
          subjectUserId: partner.partnerId,
        });
        if (cancelled) {
          return;
        }
        const completionCount = progress.facts.filter(
          (fact) => fact.completed_on === viewDate
        ).length;
        setState({
          status: "ready",
          completionCount,
          goalCount: progress.summaries.length,
        });
      } catch (error) {
        if (cancelled || isProgressContextAuthenticationError(error)) {
          return;
        }
        setState({ status: "unavailable" });
        reportDuoPartnerFetchFailure(error, {
          surface: "checklist",
          code: isProgressContextRequestError(error) ? error.code : undefined,
          status: isProgressContextRequestError(error) ? error.status : undefined,
          stalePartner: isProgressContextRequestError(error)
            ? error.code === "not_team_partner"
            : false,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [partner.partnerId, viewDate]);

  const partnerName =
    partner.partnerDisplayName ?? partner.partnerUsername ?? "Partner";

  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{partnerName}</p>
          <p className="text-xs text-muted-foreground">
            {state.status === "loading"
              ? "Loading partner status..."
              : state.status === "unavailable"
                ? "Partner checklist is unavailable."
                : `${state.completionCount} completion${
                    state.completionCount === 1 ? "" : "s"
                  } on ${format(parseISO(viewDate), "MMM d")} · ${state.goalCount} goals`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            reportDuoTelemetry("partner_strip_open", { surface: "checklist" });
            onOpenPartner();
          }}
        >
          View partner
        </Button>
      </CardContent>
    </Card>
  );
}
