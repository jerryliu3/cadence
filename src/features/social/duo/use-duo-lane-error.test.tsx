import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
const reportDuoPartnerFetchFailure = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock("@/lib/social/duo/telemetry", () => ({
  reportDuoPartnerFetchFailure: (...args: unknown[]) =>
    reportDuoPartnerFetchFailure(...args),
}));

import { ProgressContextAuthenticationError } from "@/lib/goals/progress-context";
import { useDuoLaneError } from "@/features/social/duo/use-duo-lane-error";

const messages = {
  unavailableMessage: "Partner checklist is unavailable.",
  timeoutMessage: "Today goals request timed out. Please try again.",
  fallbackMessage: "Goal progress could not be loaded.",
} as const;

function renderLaneError(failClosed: boolean, redirectToLogin = vi.fn()) {
  const rendered = renderHook(() =>
    useDuoLaneError({
      surface: "checklist",
      failClosed,
      redirectToLogin,
      ...messages,
    })
  );
  return { ...rendered, redirectToLogin };
}

describe("useDuoLaneError", () => {
  beforeEach(() => {
    toastError.mockReset();
    reportDuoPartnerFetchFailure.mockReset();
  });

  it("redirects on an auth failure before considering the lane policy", () => {
    const { result, redirectToLogin } = renderLaneError(true);

    act(() => {
      result.current.reportLoadError(
        new ProgressContextAuthenticationError("Sign in to continue")
      );
    });

    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(result.current.laneError).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
    expect(reportDuoPartnerFetchFailure).not.toHaveBeenCalled();
  });

  it("fails a partner lane closed to an inline message without a toast", () => {
    const { result } = renderLaneError(true);

    act(() => {
      result.current.reportLoadError(new Error("boom"));
    });

    expect(result.current.laneError).toBe(messages.unavailableMessage);
    expect(reportDuoPartnerFetchFailure).toHaveBeenCalledTimes(1);
    // A partner lane must never interrupt the viewer's own lane.
    expect(toastError).not.toHaveBeenCalled();
  });

  it("surfaces a viewer lane failure as a toast and never as a lane error", () => {
    const { result } = renderLaneError(false);

    act(() => {
      result.current.reportLoadError(new Error("boom"));
    });

    expect(result.current.laneError).toBeNull();
    expect(toastError).toHaveBeenCalledWith("boom");
    expect(reportDuoPartnerFetchFailure).not.toHaveBeenCalled();
  });

  it("clears a previous lane error after a successful load", () => {
    const { result } = renderLaneError(true);

    act(() => {
      result.current.reportLoadError(new Error("boom"));
    });
    expect(result.current.laneError).toBe(messages.unavailableMessage);

    act(() => {
      result.current.clearLaneError();
    });
    expect(result.current.laneError).toBeNull();
  });
});
