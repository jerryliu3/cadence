import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeDuoScopeCookie = vi.fn();

vi.mock("@/lib/social/duo/scope-cookie", () => ({
  writeDuoScopeCookie: (...args: unknown[]) => writeDuoScopeCookie(...args),
}));

vi.mock("@/lib/social/duo/telemetry", () => ({
  reportDuoTelemetry: vi.fn(),
}));

import { DuoProvider, useDuo } from "@/features/social/duo/duo-context";

function Probe() {
  const { scopePreference } = useDuo();
  return <div>{scopePreference ?? "none"}</div>;
}

describe("DuoProvider scope clamp", () => {
  beforeEach(() => {
    writeDuoScopeCookie.mockReset();
  });
  it("does not clear a stored preference while team state is unavailable", () => {
    render(
      <DuoProvider
        viewerUserId="11111111-1111-4111-8111-111111111111"
        initialState={{ activePartner: null, pendingInvite: null }}
        availability="unavailable"
        initialScopePreference="both"
      >
        <Probe />
      </DuoProvider>
    );

    expect(screen.getByText("both")).toBeInTheDocument();
    expect(writeDuoScopeCookie).not.toHaveBeenCalled();
  });

  it("clears partner/both preferences when ready with no active partner", async () => {
    render(
      <DuoProvider
        viewerUserId="11111111-1111-4111-8111-111111111111"
        initialState={{ activePartner: null, pendingInvite: null }}
        availability="ready"
        initialScopePreference="both"
      >
        <Probe />
      </DuoProvider>
    );

    await waitFor(() => {
      expect(writeDuoScopeCookie).toHaveBeenCalledWith(null);
    });
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
