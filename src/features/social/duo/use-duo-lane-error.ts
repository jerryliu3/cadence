"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { isAbortError } from "@/lib/async/abort";
import {
  isProgressContextAuthenticationError,
  isProgressContextRequestError,
} from "@/lib/goals/progress-context";
import {
  reportDuoPartnerFetchFailure,
  type DuoTelemetrySurface,
} from "@/lib/social/duo/telemetry";

/**
 * Shared load-failure policy for the duo data hooks.
 *
 * A viewer lane surfaces failures as a toast, because the user is looking at
 * their own data and a silent empty list would be a lie. A partner lane instead
 * fails closed to an inline message and reports telemetry -- it must never
 * block or interrupt the viewer's own lane (see docs/social_consolidated_plan
 * section 8.8).
 */
export function useDuoLaneError({
  surface,
  failClosed,
  redirectToLogin,
  unavailableMessage,
  timeoutMessage,
  fallbackMessage,
}: {
  surface: DuoTelemetrySurface;
  failClosed: boolean;
  redirectToLogin: () => void;
  unavailableMessage: string;
  timeoutMessage: string;
  fallbackMessage: string;
}) {
  const [laneError, setLaneError] = useState<string | null>(null);

  const clearLaneError = useCallback(() => setLaneError(null), []);

  const reportLoadError = useCallback(
    (error: unknown) => {
      if (isProgressContextAuthenticationError(error)) {
        redirectToLogin();
        return;
      }
      if (failClosed) {
        setLaneError(unavailableMessage);
        reportDuoPartnerFetchFailure(error, {
          surface,
          code: isProgressContextRequestError(error) ? error.code : undefined,
          status: isProgressContextRequestError(error) ? error.status : undefined,
          stalePartner: isProgressContextRequestError(error)
            ? error.code === "not_team_partner"
            : false,
        });
        return;
      }
      toast.error(
        isAbortError(error)
          ? timeoutMessage
          : error instanceof Error
            ? error.message
            : fallbackMessage
      );
    },
    [
      fallbackMessage,
      failClosed,
      redirectToLogin,
      surface,
      timeoutMessage,
      unavailableMessage,
    ]
  );

  return { laneError, clearLaneError, reportLoadError } as const;
}
