import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useDuoMock = vi.fn();
const useDuoScopeMock = vi.fn();
const reportDuoTelemetryMock = vi.fn();

vi.mock("@/features/social/duo/duo-context", () => ({
  useDuo: () => useDuoMock(),
  useDuoScope: () => useDuoScopeMock(),
}));

vi.mock("@/lib/social/duo/telemetry", () => ({
  reportDuoTelemetry: (...args: unknown[]) => reportDuoTelemetryMock(...args),
}));

import { useDuoSurface } from "@/features/social/duo/use-duo-surface";

describe("useDuoSurface", () => {
  beforeEach(() => {
    useDuoMock.mockReset();
    useDuoScopeMock.mockReset();
    reportDuoTelemetryMock.mockReset();
    useDuoScopeMock.mockReturnValue({
      scope: "me",
      activePartner: null,
      setScopePreference: vi.fn(),
    });
  });

  it("includes viewer avatar in the viewer lane subject", () => {
    useDuoMock.mockReturnValue({
      viewerLabel: "Jerry",
      viewerAvatarUrl: "https://project.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg",
    });

    const { result } = renderHook(() => useDuoSurface("checklist"));

    expect(result.current.viewer).toMatchObject({
      id: "viewer",
      label: "Jerry",
      readOnly: false,
      avatarUrl:
        "https://project.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg",
    });
  });
});
