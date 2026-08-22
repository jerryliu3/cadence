import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuoScopeToggle } from "@/features/social/duo/duo-scope-toggle";
import type { DuoScope } from "@cadence/shared/social/duo";

const duoScopeState = vi.hoisted(() => ({
  scope: "me" as DuoScope,
  hasActivePartner: true,
  setScopePreference: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
}));

vi.mock("@/features/social/duo/duo-context", () => ({
  useDuoScope: () => duoScopeState,
}));

describe("DuoScopeToggle", () => {
  beforeEach(() => {
    duoScopeState.scope = "me";
    duoScopeState.hasActivePartner = true;
    duoScopeState.setScopePreference.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the mode prefix and selected scope", () => {
    render(<DuoScopeToggle />);

    expect(screen.getByText("Mode:")).toBeInTheDocument();
    expect(screen.getByLabelText("Duo scope")).toHaveTextContent("Solo");
  });

  it("hides the scope toggle when no partner is active", () => {
    duoScopeState.hasActivePartner = false;

    render(<DuoScopeToggle />);

    expect(screen.queryByLabelText("Duo scope")).toBeNull();
  });
});
