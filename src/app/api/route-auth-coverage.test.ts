// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

class FakeQuery {
  select() {
    return this;
  }
  insert() {
    return this;
  }
  update() {
    return this;
  }
  upsert() {
    return this;
  }
  delete() {
    return this;
  }
  eq() {
    return this;
  }
  neq() {
    return this;
  }
  in() {
    return this;
  }
  is() {
    return this;
  }
  contains() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  range() {
    return this;
  }
  gt() {
    return this;
  }
  gte() {
    return this;
  }
  lte() {
    return this;
  }
  async maybeSingle() {
    return { data: null, error: null };
  }
  async single() {
    return { data: null, error: null };
  }
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown[]; error: null; count: number }) => TResult1)
      | null,
    onrejected?: ((reason: unknown) => TResult2) | null
  ) {
    return Promise.resolve({ data: [], error: null, count: 0 }).then(
      onfulfilled,
      onrejected
    );
  }
}

function bearerFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

function fakeClient() {
  return {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => new FakeQuery(),
  };
}

vi.mock("@/lib/supabase/route", () => ({
  createRouteClient: async (request: Request) => ({
    accessToken: bearerFromRequest(request),
    supabase: fakeClient(),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: fakeClient,
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: () => true,
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

import { POST as completionsPost } from "@/app/api/completions/route";
import { POST as bulkGoalsParsePost } from "@/app/api/bulk-goals/parse/route";
import { POST as trainingPlanParsePost } from "@/app/api/training-plan/parse/route";
import { POST as trainingPlanImportPost } from "@/app/api/training-plan/import/route";
import { GET as progressContextGet } from "@/app/api/progress/context/route";
import {
  DELETE as pushSubscriptionsDelete,
  POST as pushSubscriptionsPost,
} from "@/app/api/push/subscriptions/route";
import {
  GET as notificationPreferencesGet,
  PUT as notificationPreferencesPut,
} from "@/app/api/notifications/preferences/route";
import { POST as xpAwardsPost } from "@/app/api/xp/awards/acknowledge/route";
import { GET as xpProfileGet } from "@/app/api/xp/profile/route";
import { POST as calendarFeedRotatePost } from "@/app/api/integrations/calendar/feed/rotate/route";
import { GET as xpAchievementsGet } from "@/app/api/xp/achievements/route";
import { GET as healthStatusGet } from "@/app/api/health/status/route";
import { GET as insightsStatsGet } from "@/app/api/insights/stats/route";
import { POST as healthSamplesPost } from "@/app/api/health/samples/route";
import { POST as supportIssuesPost } from "@/app/api/support/issues/route";
import {
  DELETE as healthAutocompleteDelete,
  PUT as healthAutocompletePut,
} from "@/app/api/health/autocomplete-rules/route";
import { POST as healthDisconnectPost } from "@/app/api/health/disconnect/route";

import {
  GET as plannerContextGet,
  POST as plannerContextPost,
  PUT as plannerContextPut,
} from "@/app/api/planner/context/route";
import { POST as plannerSavePost } from "@/app/api/planner/save/route";
import { POST as plannerPreparePost } from "@/app/api/planner/prepare/route";
import { POST as plannerResetPost } from "@/app/api/planner/reset/route";
import { POST as plannerResetAllPost } from "@/app/api/planner/reset-all/route";
import { POST as plannerLockPost } from "@/app/api/planner/items/lock/route";
import { POST as plannerCoachPost } from "@/app/api/planner/coach/route";
import {
  GET as plannerConversationsGet,
  POST as plannerConversationsPost,
} from "@/app/api/planner/coach/conversations/route";
import { GET as plannerConversationGet } from "@/app/api/planner/coach/conversations/[conversationId]/route";

import {
  DELETE as teamDelete,
  GET as teamGet,
} from "@/app/api/social/team/route";
import { POST as teamInvitePost } from "@/app/api/social/team/invites/route";
import { POST as teamInviteAcceptPost } from "@/app/api/social/team/invites/[teamId]/accept/route";
import { POST as teamInviteDeclinePost } from "@/app/api/social/team/invites/[teamId]/decline/route";
import { POST as teamNudgePost } from "@/app/api/social/team/nudges/route";
import { GET as challengesGet } from "@/app/api/social/challenges/route";
import { GET as challengeGet } from "@/app/api/social/challenges/[challengeId]/route";
import {
  DELETE as challengeJoinDelete,
  POST as challengeJoinPost,
} from "@/app/api/social/challenges/[challengeId]/join/route";
import { POST as groupJoinPost } from "@/app/api/social/groups/join/route";
import { GET as feedGet } from "@/app/api/social/feed/route";
import {
  DELETE as reactionDelete,
  POST as reactionPost,
} from "@/app/api/social/feed/[eventId]/reactions/route";
import { GET as leaderboardsGet } from "@/app/api/social/leaderboards/route";
import { GET as leaderboardGet } from "@/app/api/social/leaderboards/[seasonId]/route";

import { GET as adminMetadataGet } from "@/app/api/admin/social-metadata/route";
import { POST as adminModerationPost } from "@/app/api/admin/moderation/feed-events/[id]/route";
import {
  GET as adminChallengesGet,
  POST as adminChallengesPost,
} from "@/app/api/admin/challenges/route";
import {
  DELETE as adminChallengeDelete,
  PATCH as adminChallengePatch,
} from "@/app/api/admin/challenges/[id]/route";
import {
  GET as adminSeasonsGet,
  POST as adminSeasonsPost,
} from "@/app/api/admin/seasons/route";
import {
  DELETE as adminSeasonDelete,
  PATCH as adminSeasonPatch,
} from "@/app/api/admin/seasons/[id]/route";
import { POST as adminSeasonClosePost } from "@/app/api/admin/seasons/[id]/close/route";

type Handler = (...args: never[]) => Promise<Response>;

type AuditedRouteCase = {
  label: string;
  invoke: (token: string | null) => Promise<Response>;
};

function requestFor(label: string, token: string | null, body?: unknown) {
  const [method, routePath] = label.split(" ");
  const resolvedPath = routePath
    .replace("[challengeId]", RESOURCE_ID)
    .replace("[eventId]", RESOURCE_ID)
    .replace("[seasonId]", RESOURCE_ID)
    .replace("[conversationId]", RESOURCE_ID)
    .replace("[teamId]", RESOURCE_ID)
    .replace("[id]", RESOURCE_ID);
  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (body !== undefined || (method !== "GET" && method !== "DELETE")) {
    headers.set("content-type", "application/json");
  }
  return new Request(`http://localhost${resolvedPath}`, {
    method,
    headers,
    body:
      body === undefined && (method === "GET" || method === "DELETE")
        ? undefined
        : JSON.stringify(body ?? {}),
  });
}

function routeCase(
  label: string,
  handler: Handler,
  params?: Record<string, string>,
  body?: unknown
): AuditedRouteCase {
  const invokeHandler = handler as unknown as (
    request: Request,
    context?: { params: Record<string, string> }
  ) => Promise<Response>;
  return {
    label,
    invoke: (token) =>
      invokeHandler(
        requestFor(label, token, body),
        params ? { params } : undefined
      ),
  };
}

const auditedRouteCases: AuditedRouteCase[] = [
  routeCase("POST /api/completions", completionsPost),
  routeCase("POST /api/bulk-goals/parse", bulkGoalsParsePost),
  routeCase("POST /api/training-plan/parse", trainingPlanParsePost),
  routeCase("POST /api/training-plan/import", trainingPlanImportPost),
  routeCase("GET /api/progress/context", progressContextGet),
  routeCase("POST /api/push/subscriptions", pushSubscriptionsPost),
  routeCase("DELETE /api/push/subscriptions", pushSubscriptionsDelete),
  routeCase(
    "GET /api/notifications/preferences",
    notificationPreferencesGet
  ),
  routeCase(
    "PUT /api/notifications/preferences",
    notificationPreferencesPut
  ),
  routeCase("POST /api/xp/awards/acknowledge", xpAwardsPost),
  routeCase("GET /api/xp/profile", xpProfileGet),
  routeCase("GET /api/xp/achievements", xpAchievementsGet),
  routeCase("GET /api/insights/stats", insightsStatsGet),
  routeCase("POST /api/support/issues", supportIssuesPost),
  routeCase("POST /api/integrations/calendar/feed/rotate", calendarFeedRotatePost),
  routeCase("GET /api/health/status", healthStatusGet),
  routeCase(
    "POST /api/health/samples",
    healthSamplesPost,
    undefined,
    { provider: "apple_healthkit", samples: [] }
  ),
  routeCase(
    "PUT /api/health/autocomplete-rules",
    healthAutocompletePut,
    undefined,
    {
      goalId: RESOURCE_ID,
      metricKey: "steps",
      thresholdNumeric: 8000,
    }
  ),
  {
    label: "DELETE /api/health/autocomplete-rules",
    invoke: (token) => {
      const request = requestFor("DELETE /api/health/autocomplete-rules", token);
      const url = new URL(request.url);
      url.searchParams.set("id", RESOURCE_ID);
      return healthAutocompleteDelete(new Request(url, request));
    },
  },
  routeCase(
    "POST /api/health/disconnect",
    healthDisconnectPost,
    undefined,
    { provider: "apple_healthkit" }
  ),

  routeCase("GET /api/planner/context", plannerContextGet),
  routeCase("POST /api/planner/context", plannerContextPost),
  routeCase("PUT /api/planner/context", plannerContextPut),
  routeCase("POST /api/planner/save", plannerSavePost),
  routeCase("POST /api/planner/prepare", plannerPreparePost),
  routeCase("POST /api/planner/reset", plannerResetPost),
  routeCase("POST /api/planner/reset-all", plannerResetAllPost),
  routeCase("POST /api/planner/items/lock", plannerLockPost),
  routeCase("POST /api/planner/coach", plannerCoachPost),
  routeCase("GET /api/planner/coach/conversations", plannerConversationsGet),
  routeCase("POST /api/planner/coach/conversations", plannerConversationsPost),
  routeCase(
    "GET /api/planner/coach/conversations/[conversationId]",
    plannerConversationGet,
    { conversationId: RESOURCE_ID }
  ),

  routeCase("GET /api/social/team", teamGet),
  routeCase("DELETE /api/social/team", teamDelete),
  routeCase("POST /api/social/team/invites", teamInvitePost),
  routeCase(
    "POST /api/social/team/invites/[teamId]/accept",
    teamInviteAcceptPost,
    { teamId: RESOURCE_ID },
    { visibilityAcknowledged: true }
  ),
  routeCase(
    "POST /api/social/team/invites/[teamId]/decline",
    teamInviteDeclinePost,
    { teamId: RESOURCE_ID }
  ),
  routeCase(
    "POST /api/social/team/nudges",
    teamNudgePost,
    undefined,
    { toUserId: RESOURCE_ID }
  ),
  routeCase("GET /api/social/challenges", challengesGet),
  routeCase(
    "GET /api/social/challenges/[challengeId]",
    challengeGet,
    { challengeId: RESOURCE_ID }
  ),
  routeCase(
    "POST /api/social/challenges/[challengeId]/join",
    challengeJoinPost,
    { challengeId: RESOURCE_ID }
  ),
  routeCase(
    "DELETE /api/social/challenges/[challengeId]/join",
    challengeJoinDelete,
    { challengeId: RESOURCE_ID }
  ),
  routeCase(
    "POST /api/social/groups/join",
    groupJoinPost,
    undefined,
    { joinCode: "test-code" }
  ),
  routeCase("GET /api/social/feed", feedGet),
  routeCase(
    "POST /api/social/feed/[eventId]/reactions",
    reactionPost,
    { eventId: RESOURCE_ID },
    { reaction: "cheer" }
  ),
  routeCase(
    "DELETE /api/social/feed/[eventId]/reactions",
    reactionDelete,
    { eventId: RESOURCE_ID },
    { reaction: "cheer" }
  ),
  routeCase("GET /api/social/leaderboards", leaderboardsGet),
  routeCase(
    "GET /api/social/leaderboards/[seasonId]",
    leaderboardGet,
    { seasonId: RESOURCE_ID }
  ),

  routeCase("GET /api/admin/social-metadata", adminMetadataGet),
  routeCase(
    "POST /api/admin/moderation/feed-events/[id]",
    adminModerationPost,
    { id: RESOURCE_ID }
  ),
  routeCase("GET /api/admin/challenges", adminChallengesGet),
  routeCase("POST /api/admin/challenges", adminChallengesPost),
  routeCase(
    "PATCH /api/admin/challenges/[id]",
    adminChallengePatch,
    { id: RESOURCE_ID }
  ),
  routeCase(
    "DELETE /api/admin/challenges/[id]",
    adminChallengeDelete,
    { id: RESOURCE_ID }
  ),
  routeCase("GET /api/admin/seasons", adminSeasonsGet),
  routeCase("POST /api/admin/seasons", adminSeasonsPost),
  routeCase(
    "PATCH /api/admin/seasons/[id]",
    adminSeasonPatch,
    { id: RESOURCE_ID }
  ),
  routeCase(
    "DELETE /api/admin/seasons/[id]",
    adminSeasonDelete,
    { id: RESOURCE_ID }
  ),
  routeCase(
    "POST /api/admin/seasons/[id]/close",
    adminSeasonClosePost,
    { id: RESOURCE_ID }
  ),
];

const unauthenticatedHandlers = new Set([
  "GET /api/config",
  "GET /api/push/dispatch",
  "POST /api/push/dispatch",
  "POST /api/push/outbox",
  "GET /api/support/issues",
  "GET /api/integrations/calendar/feed/[token]/cadence.ics",
]);

const apiRootFromTestFile = path.dirname(fileURLToPath(import.meta.url));

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }
    return entry.name === "route.ts" ? [entryPath] : [];
  });
}

function discoverApiHandlerLabels() {
  return collectRouteFiles(apiRootFromTestFile).flatMap((filePath) => {
    const routePath = `/api/${path
      .relative(apiRootFromTestFile, path.dirname(filePath))
      .split(path.sep)
      .join("/")}`;
    const source = readFileSync(filePath, "utf8");
    return Array.from(
      source.matchAll(
        /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g
      ),
      (match) => `${match[1]} ${routePath}`
    );
  });
}

describe("authenticated API route coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "is_platform_admin" ? true : null,
      error: null,
    }));
  });

  it("audits every authenticated route handler in the filesystem inventory", () => {
    const expected = discoverApiHandlerLabels()
      .filter((label) => !unauthenticatedHandlers.has(label))
      .sort();
    const actual = auditedRouteCases.map(({ label }) => label).sort();

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it.each(auditedRouteCases)(
    "$label threads cookie and bearer authentication",
    async ({ invoke }) => {
      mocks.getUser.mockResolvedValue({
        data: { user: { id: VIEWER_ID } },
        error: null,
      });
      const cookieResponse = await invoke(null);
      expect(cookieResponse.status).not.toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith();

      mocks.getUser.mockClear();
      const bearerResponse = await invoke("user-jwt");
      expect(bearerResponse.status).not.toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith("user-jwt");
    }
  );

  it.each(auditedRouteCases)(
    "$label rejects missing and invalid authentication",
    async ({ invoke }) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
      const cookieResponse = await invoke(null);
      expect(cookieResponse.status).toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith();

      mocks.getUser.mockClear();
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
