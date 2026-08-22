import { beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "./page";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => redirectMock(destination),
}));

describe("app root page routing", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("redirects to calendar when no tab is specified", async () => {
    await TodayPage({
      searchParams: Promise.resolve({}),
    });

    expect(redirectMock).toHaveBeenCalledWith("/app/calendar");
  });

  it("redirects legacy day links into calendar day view", async () => {
    await TodayPage({
      searchParams: Promise.resolve({ day: "2026-08-04" }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      "/app/calendar?view=day&day=2026-08-04&month=2026-08"
    );
  });

  it("redirects legacy past tab links into checklist", async () => {
    await TodayPage({
      searchParams: Promise.resolve({ tab: "past" }),
    });

    expect(redirectMock).toHaveBeenCalledWith("/app/checklist?tab=not-today");
  });
});
