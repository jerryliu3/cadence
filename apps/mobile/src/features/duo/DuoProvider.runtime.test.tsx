import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SocialTeamStateResponse } from "@cadence/shared/social/team";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuoProvider, useDuo, useDuoSurfaceScope } from "./DuoProvider";

const state = {
  userId: "user-1",
  socialEnabled: true,
  storedPreference: "both" as string | null,
  teamMode: "unavailable" as "unavailable" | "ready-empty" | "ready-active",
};

const mocks = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => Promise<string | null>>(
    async (key: string) => {
      void key;
      return state.storedPreference;
    }
  ),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(
    async (key: string, value: string) => {
      void key;
      void value;
    }
  ),
  removeItem: vi.fn<(key: string) => Promise<void>>(async (key: string) => {
    void key;
  }),
}));

vi.mock("../../lib/session", () => ({
  useSession: () => ({
    ready: true,
    session: { user: { id: state.userId } },
    userId: state.userId,
  }),
}));

vi.mock("../../lib/runtime-config", () => ({
  useForceUpgradeRequired: () => ({
    loading: false,
    required: false,
    flags: { socialEnabled: state.socialEnabled },
  }),
}));

function buildTeamResponse(mode: (typeof state)["teamMode"]): SocialTeamStateResponse {
  if (mode === "ready-active") {
    return {
      schemaVersion: "1",
      items: [
        {
          teamId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          partnerId: "22222222-2222-4222-8222-222222222222",
          partnerUsername: "alex",
          partnerDisplayName: "Alex",
          partnerAvatarUrl: null,
          inviteMessage: null,
          invitedAt: "2026-01-01T00:00:00.000Z",
          acceptedAt: "2026-01-01T00:01:00.000Z",
          closedAt: null,
          isIncoming: false,
        },
      ],
    };
  }
  return {
    schemaVersion: "1",
    items: [],
  };
}

vi.mock("../../lib/api", () => ({
  api: {
    getJson: vi.fn(async (path: string) => {
      if (path !== "/api/social/team") {
        throw new Error(`Unexpected path: ${path}`);
      }
      if (state.teamMode === "unavailable") {
        throw new Error("team unavailable");
      }
      return buildTeamResponse(state.teamMode);
    }),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: [string]) => mocks.getItem(...args),
    setItem: (...args: [string, string]) => mocks.setItem(...args),
    removeItem: (...args: [string]) => mocks.removeItem(...args),
  },
}));

async function settleQueries() {
  for (let index = 0; index < 8; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitForExpectation(assertion: () => void) {
  for (let index = 0; index < 20; index += 1) {
    try {
      assertion();
      return;
    } catch {
      await settleQueries();
    }
  }
  assertion();
}

describe("DuoProvider runtime clamp behavior", () => {
  beforeEach(() => {
    state.userId = "user-1";
    state.socialEnabled = true;
    state.storedPreference = "both";
    state.teamMode = "unavailable";
    mocks.getItem.mockClear();
    mocks.setItem.mockClear();
    mocks.removeItem.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves stored preference on unavailable load and clears only after ready no-partner refresh", async () => {
    const latest: {
      refreshTeam: (() => Promise<void>) | null;
      scopePreference: "me" | "partner" | "both" | null;
      availability: "ready" | "unavailable";
      hasActivePartner: boolean;
    } = {
      refreshTeam: null,
      scopePreference: null,
      availability: "ready",
      hasActivePartner: false,
    };

    function Probe() {
      const duo = useDuo();
      const surface = useDuoSurfaceScope("insights");
      latest.refreshTeam = duo.refreshTeam;
      latest.scopePreference = duo.scopePreference;
      latest.availability = duo.availability;
      latest.hasActivePartner = surface.hasActivePartner;
      return null;
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });

    let root: ReactTestRenderer | null = null;
    await act(async () => {
      root = create(
        <QueryClientProvider client={queryClient}>
          <DuoProvider>
            <Probe />
          </DuoProvider>
        </QueryClientProvider>
      );
    });

    await waitForExpectation(() => {
      expect(latest.availability).toBe("unavailable");
      expect(latest.scopePreference).toBe("both");
      expect(mocks.removeItem).not.toHaveBeenCalled();
    });

    state.teamMode = "ready-empty";
    await act(async () => {
      await latest.refreshTeam?.();
    });
    await settleQueries();

    await waitForExpectation(() => {
      expect(latest.availability).toBe("ready");
      expect(latest.hasActivePartner).toBe(false);
      expect(latest.scopePreference).toBeNull();
      expect(mocks.removeItem).toHaveBeenCalledWith("mobile:duo:scope:user-1");
    });

    await act(async () => {
      root?.unmount();
    });
  });

  it("retains stored partner/both preference when active partner exists", async () => {
    state.teamMode = "ready-active";

    const latest: {
      scopePreference: "me" | "partner" | "both" | null;
      hasActivePartner: boolean;
      availability: "ready" | "unavailable";
    } = {
      scopePreference: null,
      hasActivePartner: false,
      availability: "ready",
    };

    function Probe() {
      const duo = useDuo();
      const surface = useDuoSurfaceScope("insights");
      latest.scopePreference = duo.scopePreference;
      latest.hasActivePartner = surface.hasActivePartner;
      latest.availability = duo.availability;
      return null;
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });

    let root: ReactTestRenderer | null = null;
    await act(async () => {
      root = create(
        <QueryClientProvider client={queryClient}>
          <DuoProvider>
            <Probe />
          </DuoProvider>
        </QueryClientProvider>
      );
    });

    await waitForExpectation(() => {
      expect(latest.availability).toBe("ready");
      expect(latest.hasActivePartner).toBe(true);
      expect(latest.scopePreference).toBe("both");
      expect(mocks.removeItem).not.toHaveBeenCalled();
    });

    await act(async () => {
      root?.unmount();
    });
  });
});
