import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CalendarPartnerReadOnlySection } from "./CalendarPartnerReadOnlySection";

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
      card: "#111",
      foreground: "#fff",
      mutedForeground: "#ccc",
      secondary: "#222",
    },
  }),
}));

describe("CalendarPartnerReadOnlySection partner boundary", () => {
  it("renders read-only banner and partner markers without mutation controls", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <CalendarPartnerReadOnlySection
          visibleDays={["2026-08-14"]}
          markersByDate={
            new Map([
              [
                "2026-08-14",
                [
                  {
                    key: "partner:g1",
                    originalGoalId: "g1",
                    unitKey: "partner-fact",
                    goalTitle: "Read",
                    scheduledDate: "2026-08-14",
                    owner: "partner",
                  },
                ],
              ],
            ])
          }
          loading={false}
        />
      );
    });

    const rendered = root.root
      .findAllByType("text")
      .map((node: ReactTestInstance) => node.props.children)
      .flat()
      .join(" ");

    const pressables = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "pressable"
    );

    expect(rendered).toContain("Partner completions (view only)");
    expect(rendered).toContain("Partner marked this done:");
    expect(rendered).toContain("Read");
    expect(pressables).toHaveLength(0);
  });
});
