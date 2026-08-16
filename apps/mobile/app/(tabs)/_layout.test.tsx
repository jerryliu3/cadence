import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Text, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import TabsLayout from "./_layout";

vi.mock("@cadence/shared/navigation/tabs", () => ({
  buildAppTabs: () => [
    { key: "insights", label: "Insights" },
    { key: "checklist", label: "Today" },
    { key: "calendar", label: "Calendar" },
    { key: "social", label: "Challenges" },
    { key: "settings", label: "Profile" },
  ],
}));

vi.mock("../../src/lib/runtime-config", () => ({
  useForceUpgradeRequired: () => ({
    loading: false,
    required: false,
    flags: {
      socialEnabled: true,
    },
  }),
}));

vi.mock("../../src/lib/session", () => ({
  useSession: () => ({
    ready: true,
    session: {
      user: { id: "user-1" },
    },
  }),
}));

vi.mock("../../src/lib/navigation-preferences", () => ({
  useProfileNavigationPreferences: () => ({
    loading: false,
    plannerPrimaryTabPreference: "checklist",
  }),
}));

vi.mock("../../src/theme", () => ({
  useTheme: () => ({
    colors: {
      background: "#101010",
      foreground: "#f3f3f3",
      card: "#232323",
      primary: "#7ac7ff",
      mutedForeground: "#7b7b7b",
    },
  }),
}));

vi.mock("../../src/features/duo/DuoProvider", () => ({
  DuoProvider: ({ children }: { children: ReactNode }) => (
    <View testID="duo-provider">{children}</View>
  ),
}));

vi.mock("../../src/features/journey/JourneyProvider.native", () => ({
  JourneyProvider: ({ children }: { children: ReactNode }) => (
    <View testID="journey-provider">{children}</View>
  ),
  useJourney: () => ({
    progressState: {
      schemaVersion: 1,
      routeId: "first-ascent",
      seasonId: null,
      biome: "basecamp",
      checkpointIndex: 0,
      checkpointProgress: 0,
      showPartner: false,
      partnerProgress: null,
    },
    renderPolicy: {
      assetVersion: "v1",
      motionMode: "still",
      qualityTier: "standard",
      videoEnabled: false,
      riveEnabled: false,
      lifecyclePaused: false,
    },
    scene: {
      id: "basecamp-v1",
      version: "v1",
      biome: "basecamp",
      poster: {
        mobile: { url: "https://example.com/mobile.webp", mimeType: "image/webp", width: 100, height: 100 },
        desktop: { url: "https://example.com/desktop.webp", mimeType: "image/webp", width: 100, height: 100 },
      },
      video: { mobile: [], desktop: [] },
      focalPoint: { mobile: { x: 0.5, y: 0.5 }, desktop: { x: 0.5, y: 0.5 } },
      scrim: { opacity: 0.5, position: "full" },
      loopDurationMs: 12000,
      fallbackSceneId: null,
    },
    presentation: {
      visible: true,
      contrast: "default",
      preferredComposition: "default",
    },
    setPresentation: () => undefined,
    resetPresentation: () => undefined,
  }),
}));

vi.mock("../../src/features/journey/JourneyBackdrop.native", () => ({
  JourneyBackdrop: () => <View testID="journey-backdrop" />,
}));

vi.mock("../../src/ui/screen", () => ({
  LoadingScreen: () => <Text testID="loading-screen">Loading</Text>,
}));

vi.mock("expo-router", () => {
  const Tabs = ({ children }: { children: ReactNode }) => (
    <View testID="tabs-root">{children}</View>
  );
  Tabs.displayName = "TabsMock";
  const TabScreenMock = ({ name }: { name: string }) => (
    <View testID={`tab-${name}`} />
  );
  TabScreenMock.displayName = "TabScreenMock";
  Tabs.Screen = TabScreenMock;
  return {
    Redirect: ({ href }: { href: string }) => <Text testID={`redirect-${href}`}>{href}</Text>,
    Tabs,
  };
});

describe("TabsLayout", () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      renderer.unmount();
      renderer = null;
    }
  });

  it("mounts a single journey backdrop owner in tab shell", async () => {
    await act(async () => {
      renderer = create(<TabsLayout />);
    });

    if (!renderer) {
      throw new Error("renderer missing");
    }

    const journeyBackdrops = renderer.root.findAllByProps({
      testID: "journey-backdrop",
    });
    expect(journeyBackdrops).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: "tabs-root" })).toHaveLength(1);
  });
});
