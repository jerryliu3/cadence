import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "./proxy";

const updateSessionMock = vi.fn(async (request: NextRequest) => {
  void request;
  return NextResponse.next();
});

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: (request: NextRequest) => updateSessionMock(request),
}));

describe("proxy", () => {
  beforeEach(() => {
    updateSessionMock.mockClear();
  });

  it("redirects bare root requests to /app/calendar", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/")
    );

    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/calendar"
    );
  });

  it("passes non-root requests through session update", async () => {
    const request = new NextRequest("http://localhost:3000/app/calendar");

    await proxy(request);

    expect(updateSessionMock).toHaveBeenCalledTimes(1);
    expect(updateSessionMock).toHaveBeenCalledWith(request);
  });
});
