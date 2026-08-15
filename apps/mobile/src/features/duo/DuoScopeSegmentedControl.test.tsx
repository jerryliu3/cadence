import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DuoScopeSegmentedControl } from "./DuoScopeSegmentedControl";

const mocks = vi.hoisted(() => ({
  setScopePreference: vi.fn<(_: "me" | "partner" | "both") => Promise<void>>(),
}));

vi.mock("react-native", () => ({
  Pressable: (props: Record<string, unknown>) =>
    React.createElement("pressable", props),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("text", null, children),
  View: ({ children }: { children: React.ReactNode }) =>
    React.createElement("view", null, children),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#000",
      primary: "#111",
      secondary: "#222",
      primaryForeground: "#fff",
      secondaryForeground: "#fff",
      destructive: "#f00",
    },
  }),
}));

vi.mock("./DuoProvider", () => ({
  useDuoSurfaceScope: () => ({
    hasActivePartner: true,
    scope: "me" as const,
    setScopePreference: mocks.setScopePreference,
  }),
}));

describe("DuoScopeSegmentedControl", () => {
  it("surfaces a save error when persistence fails", async () => {
    mocks.setScopePreference.mockRejectedValueOnce(new Error("storage failed"));
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<DuoScopeSegmentedControl surface="insights" />);
    });
    const pressables = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "pressable"
    );
    expect(pressables[0]?.props.accessibilityRole).toBe("tab");
    expect(pressables[0]?.props.accessibilityState).toEqual({
      selected: true,
    });
    expect(pressables[1]?.props.accessibilityState).toEqual({
      selected: false,
    });

    await act(async () => {
      pressables[1]?.props.onPress();
      await Promise.resolve();
    });

    const textNodes = root.root.findAllByType("text");
    const renderedText = textNodes
      .map((node: ReactTestInstance) => node.props.children)
      .flat()
      .join(" ");

    expect(renderedText).toContain("Could not save scope preference.");
  });
});
