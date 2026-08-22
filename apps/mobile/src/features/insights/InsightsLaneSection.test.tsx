import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { InsightsLaneSection } from "./InsightsLaneSection";

vi.mock("react-native", () => ({
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("text", null, children),
  View: ({ children }: { children: React.ReactNode }) =>
    React.createElement("view", null, children),
  Pressable: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress: () => void;
  }) => React.createElement("pressable", { onPress }, children),
  StyleSheet: { create: <T,>(styles: T) => styles },
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#000",
      foreground: "#fff",
      mutedForeground: "#ccc",
      destructive: "#f00",
    },
  }),
}));

describe("InsightsLaneSection partner boundary", () => {
  it("renders read-only partner lane treatment without mutation controls", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <InsightsLaneSection
          showHeading
          headingLabel="Alex"
          readOnly
          tone="muted"
          message="Partner insights are unavailable."
        />
      );
    });

    const textNodes = root.root.findAllByType("text");
    const rendered = textNodes
      .map((node: ReactTestInstance) => node.props.children)
      .flat()
      .join(" ");
    const pressables = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "pressable"
    );

    expect(rendered).toContain("Alex");
    expect(rendered).toContain("View only");
    expect(rendered).toContain("Partner insights are unavailable.");
    expect(pressables).toHaveLength(0);
  });
});
