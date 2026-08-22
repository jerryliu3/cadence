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

  it("lets the public landing page own bare root requests", async () => {
    const request = new NextRequest("http://localhost:3000/");

    const response = await proxy(request);

    expect(updateSessionMock).toHaveBeenCalledTimes(1);
    expect(updateSessionMock).toHaveBeenCalledWith(request);
    expect(response.status).not.toBe(307);
  });

  it("passes non-root requests through session update", async () => {
    const request = new NextRequest("http://localhost:3000/app/calendar");

    await proxy(request);

    expect(updateSessionMock).toHaveBeenCalledTimes(1);
    expect(updateSessionMock).toHaveBeenCalledWith(request);
  });
});
