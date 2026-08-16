// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedRequestContext: vi.fn(),
  getServerEnv: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/lib/api/route", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route")>(
    "@/lib/api/route"
  );
  return {
    ...actual,
    requireAuthenticatedRequestContext: mocks.requireAuthenticatedRequestContext,
  };
});

vi.mock("@/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: mocks.reportError,
}));

import { GET, POST } from "./route";
import { ApiRouteError } from "@/lib/api/route";

function createSupabaseInsertMock() {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from, insert, select, single };
}

describe("POST /api/support/issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores the issue report even when email is not configured", async () => {
    const supabaseMock = createSupabaseInsertMock();
    supabaseMock.single.mockResolvedValue({
      data: { id: "issue-1", created_at: "2026-08-16T15:00:00.000Z" },
      error: null,
    });
    mocks.requireAuthenticatedRequestContext.mockResolvedValue({
      userId: "viewer-1",
      supabase: { from: supabaseMock.from },
    });
    mocks.getServerEnv.mockReturnValue({
      RESEND_API_KEY: undefined,
      REPORT_ISSUES_FROM_EMAIL: undefined,
      REPORT_ISSUES_TO_EMAIL: undefined,
    });

    const response = await POST(
      new Request("http://localhost/api/support/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Calendar day card overflows",
          description: "Open calendar and rotate to landscape.",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.emailDelivery).toBe("not_configured");
    expect(supabaseMock.from).toHaveBeenCalledWith("issue_reports");
    expect(supabaseMock.insert).toHaveBeenCalledWith({
      reporter_id: "viewer-1",
      title: "Calendar day card overflows",
      description: "Open calendar and rotate to landscape.",
    });
  });

  it("returns 401 when authentication is missing", async () => {
    mocks.requireAuthenticatedRequestContext.mockRejectedValue(
      new ApiRouteError(401, "authentication_required", "Sign in first.")
    );

    const response = await POST(
      new Request("http://localhost/api/support/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Need auth",
          description: "Should fail before insert.",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("authentication_required");
  });

  it("returns 400 for invalid payloads", async () => {
    const supabaseMock = createSupabaseInsertMock();
    mocks.requireAuthenticatedRequestContext.mockResolvedValue({
      userId: "viewer-1",
      supabase: { from: supabaseMock.from },
    });

    const response = await POST(
      new Request("http://localhost/api/support/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          description: "Missing title should fail validation.",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("validation_failed");
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });

  it("returns 500 when issue persistence fails", async () => {
    const supabaseMock = createSupabaseInsertMock();
    supabaseMock.single.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });
    mocks.requireAuthenticatedRequestContext.mockResolvedValue({
      userId: "viewer-1",
      supabase: { from: supabaseMock.from },
    });
    mocks.getServerEnv.mockReturnValue({
      RESEND_API_KEY: undefined,
      REPORT_ISSUES_FROM_EMAIL: undefined,
      REPORT_ISSUES_TO_EMAIL: undefined,
    });

    const response = await POST(
      new Request("http://localhost/api/support/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Persistence failure",
          description: "DB insert path should surface a typed error.",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.code).toBe("issue_report_create_failed");
  });

  it("sends an email through Resend when configured", async () => {
    const supabaseMock = createSupabaseInsertMock();
    supabaseMock.single.mockResolvedValue({
      data: { id: "issue-2", created_at: "2026-08-16T15:05:00.000Z" },
      error: null,
    });
    mocks.requireAuthenticatedRequestContext.mockResolvedValue({
      userId: "viewer-2",
      supabase: { from: supabaseMock.from },
    });
    mocks.getServerEnv.mockReturnValue({
      RESEND_API_KEY: "resend-key",
      REPORT_ISSUES_FROM_EMAIL: "Cadence <onboarding@resend.dev>",
      REPORT_ISSUES_TO_EMAIL: "3jerryliu@gmail.com",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "email-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const response = await POST(
      new Request("http://localhost/api/support/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Settings screen stutters",
          description: "Noticeable lag after opening the panel.",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.emailDelivery).toBe("sent");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});

describe("GET /api/support/issues", () => {
  it("returns a typed 405 response", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(405);
    expect(payload.code).toBe("method_not_allowed");
  });
});
