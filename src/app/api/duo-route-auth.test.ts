// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER_ID = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  socialEnabled: true,
  rowsByTable: {} as Record<string, Array<Record<string, unknown>>>,
}));

class FakeQuery {
  private cursor: string | null = null;
  private pageSize = 1_000;
  private readonly filters = new Map<string, unknown>();

  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  order() {
    return this;
  }

  limit(limit: number) {
    this.pageSize = limit;
    return this;
  }

  gt(_column: string, value: string) {
    this.cursor = value;
    return this;
  }

  async maybeSingle() {
    const data =
      this.rows
        .filter((row) =>
          Array.from(this.filters).every(
            ([column, value]) => row[column] === value
          )
        )
        .at(0) ?? null;
    return { data, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const data = this.rows
      .filter((row) =>
        Array.from(this.filters).every(([column, value]) => row[column] === value)
      )
      .filter((row) => !this.cursor || String(row.id) > this.cursor)
      .slice(0, this.pageSize);
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function bearerFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function goalRow() {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    owner_id: VIEWER_ID,
    title: "Goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 1,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

vi.mock("@/lib/supabase/route", () => ({
  createRouteClient: async (request: Request) => ({
    accessToken: bearerFromRequest(request),
    supabase: {
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
      from: (table: string) => new FakeQuery(mocks.rowsByTable[table] ?? []),
    },
  }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (flag: string) => flag === "socialEnabled" && mocks.socialEnabled,
}));

vi.mock("@/lib/push/outbox", () => ({
  flushNotificationOutbox: vi.fn().mockResolvedValue({
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    removedSubscriptions: 0,
  }),
}));

import { DELETE as teamDelete, GET as teamGet } from "@/app/api/social/team/route";
import { POST as inviteCreate } from "@/app/api/social/team/invites/route";
import { POST as inviteAccept } from "@/app/api/social/team/invites/[teamId]/accept/route";
import { POST as inviteDecline } from "@/app/api/social/team/invites/[teamId]/decline/route";
import { POST as createNudge } from "@/app/api/social/team/nudges/route";
import { GET as progressContextGet } from "@/app/api/progress/context/route";

type AuditedRouteCase = {
  label: string;
  invoke: (token: string | null) => Promise<Response>;
  setupSuccessMocks: () => void;
};

function requestWithOptionalBearer(
  input: string,
  init: RequestInit,
  token: string | null
) {
  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return new Request(input, { ...init, headers });
}

const auditedRouteCases: AuditedRouteCase[] = [
  {
    label: "GET /api/social/team",
    invoke: (token) =>
      teamGet(
        requestWithOptionalBearer(
          "http://localhost/api/social/team",
          { method: "GET" },
          token
        )
      ),
    setupSuccessMocks: () => {
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "get_team_state") {
          return { data: [], error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
  {
    label: "DELETE /api/social/team",
    invoke: (token) =>
      teamDelete(
        requestWithOptionalBearer(
          "http://localhost/api/social/team",
          { method: "DELETE" },
          token
        )
      ),
    setupSuccessMocks: () => {
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "dissolve_team_service") {
          return { data: true, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
  {
    label: "POST /api/social/team/invites",
    invoke: (token) =>
      inviteCreate(
        requestWithOptionalBearer(
          "http://localhost/api/social/team/invites",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              partnerId: PARTNER_ID,
              message: "hi",
            }),
          },
          token
        )
      ),
    setupSuccessMocks: () => {
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "create_team_invite_service") {
          return { data: TEAM_ID, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
  {
    label: "POST /api/social/team/invites/[teamId]/accept",
    invoke: (token) =>
      inviteAccept(
        requestWithOptionalBearer(
          `http://localhost/api/social/team/invites/${TEAM_ID}/accept`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visibilityAcknowledged: true }),
          },
          token
        ),
        { params: { teamId: TEAM_ID } }
      ),
    setupSuccessMocks: () => {
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "accept_team_invite_service") {
          return { data: true, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
  {
    label: "POST /api/social/team/invites/[teamId]/decline",
    invoke: (token) =>
      inviteDecline(
        requestWithOptionalBearer(
          `http://localhost/api/social/team/invites/${TEAM_ID}/decline`,
          { method: "POST" },
          token
        ),
        { params: { teamId: TEAM_ID } }
      ),
    setupSuccessMocks: () => {
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "decline_team_invite_service") {
          return { data: true, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
  {
    label: "POST /api/social/team/nudges",
    invoke: (token) =>
      createNudge(
        requestWithOptionalBearer(
          "http://localhost/api/social/team/nudges",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toUserId: PARTNER_ID,
              kind: "cheer",
            }),
          },
          token
        )
      ),
    setupSuccessMocks: () => {
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "send_nudge_service") {
          return { data: "nudge-1", error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
  {
    label: "GET /api/progress/context",
    invoke: (token) =>
      progressContextGet(
        requestWithOptionalBearer(
          "http://localhost/api/progress/context?asOfDate=2026-08-01&timezone=UTC&viewDate=2026-08-01",
          { method: "GET" },
          token
        )
      ),
    setupSuccessMocks: () => {
      mocks.rowsByTable = {
        profiles: [{ id: VIEWER_ID, week_starts_on: 1 }],
        goals: [goalRow()],
        completions: [],
      };
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "get_team_state") {
          return { data: [], error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      });
    },
  },
];

describe("audited Duo route auth coverage", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
    mocks.socialEnabled = true;
    mocks.rowsByTable = {};
  });

  it.each(auditedRouteCases)(
    "$label accepts cookie and bearer auth contexts",
    async ({ invoke, setupSuccessMocks }) => {
      setupSuccessMocks();
      mocks.getUser.mockResolvedValue({
        data: { user: { id: VIEWER_ID } },
        error: null,
      });
      const cookieResponse = await invoke(null);
      expect(cookieResponse.status).not.toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith();

      mocks.getUser.mockClear();
      setupSuccessMocks();
      mocks.getUser.mockResolvedValue({
        data: { user: { id: VIEWER_ID } },
        error: null,
      });
      const bearerResponse = await invoke("user-jwt");
      expect(bearerResponse.status).not.toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith("user-jwt");
    }
  );

  it.each(auditedRouteCases)(
    "$label returns 401 for missing or invalid auth",
    async ({ invoke, setupSuccessMocks }) => {
      setupSuccessMocks();
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
      const cookieResponse = await invoke(null);
      expect(cookieResponse.status).toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith();

      mocks.getUser.mockClear();
      setupSuccessMocks();
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "invalid JWT" },
      });
      const bearerResponse = await invoke("expired-jwt");
      expect(bearerResponse.status).toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith("expired-jwt");
    }
  );
});
