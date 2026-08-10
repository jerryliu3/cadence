// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createAdminClient: vi.fn(),
  upsert: vi.fn(),
  deleteRows: vi.fn(),
  deleteEqUser: vi.fn(),
  deleteEqEndpoint: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { DELETE, POST } from "./route";

const validSubscriptionPayload = {
  endpoint: "https://example.test/subscription",
  keys: {
    p256dh: "key",
    auth: "auth",
  },
};

describe("push subscriptions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: "11111111-1111-4111-8111-111111111111" },
      },
      error: null,
    });

    mocks.upsert.mockResolvedValue({ error: null });
    mocks.deleteRows.mockResolvedValue({ error: null });
    mocks.deleteEqEndpoint.mockImplementation(() => mocks.deleteRows());
    mocks.deleteEqUser.mockReturnValue({
      eq: mocks.deleteEqEndpoint,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table !== "push_subscriptions") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        upsert: mocks.upsert,
        delete: () => ({
          eq: mocks.deleteEqUser,
        }),
      };
    });
    mocks.createAdminClient.mockReturnValue({
      from: mocks.from,
    });
  });

  it("returns validation_failed for malformed payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(null),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      correlationId: expect.any(String),
    });
  });

  it("returns authentication_required before validation for unauthenticated users", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validSubscriptionPayload),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
      correlationId: expect.any(String),
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("stores subscriptions and returns a correlation id", async () => {
    const response = await POST(
      new Request("http://localhost/api/push/subscriptions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "vitest-agent",
        },
        body: JSON.stringify(validSubscriptionPayload),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      correlationId: expect.any(String),
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://example.test/subscription",
      }),
      { onConflict: "endpoint" }
    );
  });

  it("returns push_configuration_invalid when admin client is unavailable", async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error("missing service role key");
    });

    const response = await POST(
      new Request("http://localhost/api/push/subscriptions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(validSubscriptionPayload),
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "push_configuration_invalid",
      correlationId: expect.any(String),
    });
  });

  it("returns push_subscription_upsert_failed when upsert fails", async () => {
    mocks.upsert.mockResolvedValue({
      error: { message: "upsert failed" },
    });

    const response = await POST(
      new Request("http://localhost/api/push/subscriptions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(validSubscriptionPayload),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "push_subscription_upsert_failed",
      correlationId: expect.any(String),
    });
  });

  it("deletes subscriptions and returns a correlation id", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/push/subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: "https://example.test/subscription" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      correlationId: expect.any(String),
    });
    expect(mocks.deleteEqUser).toHaveBeenCalledWith(
      "user_id",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(mocks.deleteEqEndpoint).toHaveBeenCalledWith(
      "endpoint",
      "https://example.test/subscription"
    );
  });

  it("returns push_subscription_delete_failed when delete fails", async () => {
    mocks.deleteRows.mockResolvedValue({
      error: { message: "delete failed" },
    });

    const response = await DELETE(
      new Request("http://localhost/api/push/subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: "https://example.test/subscription" }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "push_subscription_delete_failed",
      correlationId: expect.any(String),
    });
  });
});
