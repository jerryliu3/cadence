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
    await TodayPage();

    expect(redirectMock).toHaveBeenCalledWith("/calendar");
  });
});
