// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  socialEnabled: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (flag: string) => flag === "socialEnabled" && mocks.socialEnabled,
}));

import { GET } from "./route";

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
    const data = this.rows
      .filter((row) =>
        Array.from(this.filters).every(([column, value]) => row[column] === value)
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
    return Promise.resolve({ data, error: null }).then(
      onfulfilled,
      onrejected
    );
  }
}

function goal(): Goal {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    owner_id: "11111111-1111-4111-8111-111111111111",
    title: "Bounded goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 2_000,
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

function completions(count: number): Completion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    goal_id: "10000000-0000-4000-8000-000000000001",
    user_id: "11111111-1111-4111-8111-111111111111",
    completed_on: "2026-08-01",
    source: "manual",
    created_at: "2026-08-01T12:00:00Z",
  }));
}

describe("bounded progress context route", () => {
  it.each([
    {
      label: "social is disabled",
      socialEnabled: false,
      teamStateRows: [] as Array<Record<string, unknown>>,
    },
    {
      label: "viewer has no active team",
      socialEnabled: true,
      teamStateRows: [] as Array<Record<string, unknown>>,
    },
    {
      label: "subject is not the active partner",
      socialEnabled: true,
      teamStateRows: [
        {
          team_id: "44444444-4444-4444-8444-444444444444",
          status: "active",
          partner_id: "99999999-9999-4999-8999-999999999999",
          partner_username: "other-partner",
          partner_display_name: "Other Partner",
          partner_avatar_url: null,
          invite_message: null,
          invited_at: "2026-08-01T00:00:00Z",
          accepted_at: "2026-08-01T00:00:00Z",
          closed_at: null,
          is_incoming: false,
        },
      ],
    },
  ])(
    "returns not_team_partner when $label",
    async ({ socialEnabled, teamStateRows }) => {
      mocks.socialEnabled = socialEnabled;
      mocks.client = {
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "11111111-1111-4111-8111-111111111111" },
            },
            error: null,
          }),
        },
        rpc: async () => ({ data: teamStateRows, error: null }),
        from: () => new FakeQuery([]),
      };

      const response = await GET(
        new Request(
          "http://localhost/api/progress/context?asOfDate=2026-08-01&timezone=UTC&subjectUserId=22222222-2222-4222-8222-222222222222"
        )
      );
      const body = (await response.json()) as { code: string };

      expect(response.status).toBe(403);
      expect(body.code).toBe("not_team_partner");
    }
  );

  it("keyset-pages beyond the PostgREST 1000-row ceiling", async () => {
    mocks.socialEnabled = true;
    const goalRows = [goal()];
    const completionRows = completions(1_005);
    const profileRows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        week_starts_on: 1,
      },
    ];
    mocks.client = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "11111111-1111-4111-8111-111111111111" },
          },
          error: null,
        }),
      },
      rpc: async () => ({ data: [], error: null }),
      from: (table: string) =>
        new FakeQuery(
          (
            table === "goals"
              ? goalRows
              : table === "completions"
                ? completionRows
                : profileRows
          ) as unknown as Array<Record<string, unknown>>
        ),
    };

    const response = await GET(
      new Request(
        "http://localhost/api/progress/context?asOfDate=2026-08-01&factsFrom=2026-08-01&factsTo=2026-08-01&timezone=UTC"
      )
    );
    const body = (await response.json()) as {
      truncated: boolean;
      facts: unknown[];
      summaries: Array<{ admissibleCompletionCount: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.facts).toHaveLength(1_005);
    expect(body.summaries[0]?.admissibleCompletionCount).toBe(1_005);
  });

});
