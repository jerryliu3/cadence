import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvite: vi.fn(),
  rpc: vi.fn(),
  pendingInvite: null as null | {
    teamId: string;
    isIncoming: boolean;
    partnerDisplayName: string;
    partnerUsername: string;
  },
}));

vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  return {
    Pressable: (props: Record<string, unknown>) =>
      ReactModule.createElement("Pressable", props),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: (props: Record<string, unknown>) =>
      ReactModule.createElement("Text", props),
    TextInput: (props: Record<string, unknown>) =>
      ReactModule.createElement("TextInput", props),
    View: (props: Record<string, unknown>) =>
      ReactModule.createElement("View", props),
  };
});
vi.mock("../../lib/session", () => ({
  useSession: () => ({ userId: "viewer-1" }),
}));
vi.mock("../../lib/api", () => ({ api: {} }));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { username: "viewer" },
          error: null,
        }),
      };
      return query;
    },
    rpc: mocks.rpc,
  },
}));
vi.mock("../duo/DuoProvider", () => ({
  useDuo: () => ({
    socialEnabled: true,
    availability: "ready",
    teamLoading: false,
    teamRefreshing: false,
    state: { activePartner: null, pendingInvite: mocks.pendingInvite },
    refreshTeam: vi.fn(),
  }),
}));
vi.mock("../duo/lifecycle", () => ({
  createDuoLifecycleMutations: () => ({
    createInvite: mocks.createInvite,
    acceptIncomingInvite: vi.fn(),
    declineIncomingInvite: vi.fn(),
    dissolveActiveTeam: vi.fn(),
    sendCheerToActivePartner: vi.fn(),
  }),
}));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      foreground: "#111",
      mutedForeground: "#777",
      destructive: "#f00",
      border: "#ccc",
      primary: "#00f",
    },
  }),
}));
vi.mock("../../ui/button", async () => {
  const ReactModule = await import("react");
  return {
    PrimaryButton: (props: Record<string, unknown>) =>
      ReactModule.createElement("PrimaryButton", props),
  };
});
vi.mock("../../ui/screen", async () => {
  const ReactModule = await import("react");
  return {
    LoadingScreen: () => ReactModule.createElement("LoadingScreen"),
    Screen: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement("Screen", null, children),
  };
});

import { SocialScreen } from "./SocialScreen";

function findHost(root: ReactTestInstance, type: string) {
  return root.findAll((node) => String(node.type) === type);
}

describe("SocialScreen Duo onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingInvite = null;
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "partner-1",
          username: "alex",
          display_name: "Alex",
          avatar_url: "",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    });
    mocks.createInvite.mockResolvedValue(undefined);
  });

  it("invites the selected username result instead of raw input", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={client}>
          <SocialScreen />
        </QueryClientProvider>
      );
    });
    const root = renderer.root;
    const inputs = findHost(root, "TextInput");

    act(() => {
      inputs
        .find((input) => input.props.placeholder === "Partner username")
        ?.props.onChangeText("alex");
    });
    await act(async () => {
      await findHost(root, "PrimaryButton")
        .find((button) => button.props.label === "Search")
        ?.props.onPress();
    });
    act(() => {
      findHost(root, "Pressable")
        .find((result) => result.props.accessibilityRole === "radio")
        ?.props.onPress();
      inputs
        .find((input) => input.props.placeholder === "Optional message")
        ?.props.onChangeText("Let's team up");
    });
    await act(async () => {
      await findHost(root, "PrimaryButton")
        .find((button) => button.props.label === "Send invite")
        ?.props.onPress();
    });

    expect(mocks.createInvite).toHaveBeenCalledWith({
      partnerUsername: "alex",
      message: "Let's team up",
    });
    act(() => renderer.unmount());
  });

  it("clears stale partner results and selection when the search changes", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={client}>
          <SocialScreen />
        </QueryClientProvider>
      );
    });
    const partnerInput = findHost(renderer.root, "TextInput").find(
      (input) => input.props.placeholder === "Partner username"
    );

    act(() => partnerInput?.props.onChangeText("alex"));
    await act(async () => {
      await findHost(renderer.root, "PrimaryButton")
        .find((button) => button.props.label === "Search")
        ?.props.onPress();
    });
    act(() => {
      findHost(renderer.root, "Pressable")
        .find((result) => result.props.accessibilityRole === "radio")
        ?.props.onPress();
    });
    expect(
      findHost(renderer.root, "PrimaryButton").find(
        (button) => button.props.label === "Send invite"
      )?.props.disabled
    ).toBe(false);

    act(() => partnerInput?.props.onChangeText("different-user"));

    expect(
      findHost(renderer.root, "Pressable").filter(
        (result) => result.props.accessibilityRole === "radio"
      )
    ).toHaveLength(0);
    expect(
      findHost(renderer.root, "PrimaryButton").find(
        (button) => button.props.label === "Send invite"
      )?.props.disabled
    ).toBe(true);
    act(() => renderer.unmount());
  });

  it("exposes the visibility acknowledgement as a checkbox", async () => {
    mocks.pendingInvite = {
      teamId: "team-1",
      isIncoming: true,
      partnerDisplayName: "Alex",
      partnerUsername: "alex",
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={client}>
          <SocialScreen />
        </QueryClientProvider>
      );
    });

    const checkbox = findHost(renderer.root, "Pressable").find(
      (node) => node.props.accessibilityRole === "checkbox"
    );
    expect(checkbox?.props.accessibilityState).toEqual({ checked: false });
    act(() => checkbox?.props.onPress());
    expect(
      findHost(renderer.root, "Pressable").find(
        (node) => node.props.accessibilityRole === "checkbox"
      )?.props.accessibilityState
    ).toEqual({ checked: true });

    act(() => renderer.unmount());
  });
});
