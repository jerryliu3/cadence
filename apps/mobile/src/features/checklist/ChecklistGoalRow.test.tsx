import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ChecklistGoalRow } from "./ChecklistGoalRow";

vi.mock("react-native", () => ({
  Pressable: (props: Record<string, unknown>) =>
    React.createElement("pressable", props),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("text", null, children),
  View: (props: Record<string, unknown>) =>
    React.createElement("view", props),
  StyleSheet: { create: <T,>(styles: T) => styles },
}));

vi.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement("link", null, children),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#000",
      card: "#111",
      foreground: "#fff",
      mutedForeground: "#ccc",
      secondary: "#222",
      primary: "#0f0",
      primaryForeground: "#fff",
    },
  }),
}));

describe("ChecklistGoalRow partner boundary", () => {
  it("renders no mutation or edit affordance for read-only rows", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ChecklistGoalRow
          title="Partner goal"
          category="Health"
          done={false}
          interactive={false}
          onToggle={() => undefined}
        />
      );
    });

    const pressables = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "pressable"
    );
    const links = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "link"
    );

    expect(pressables).toHaveLength(0);
    expect(links).toHaveLength(0);
    const checkbox = root.root.find(
      (node: ReactTestInstance) =>
        node.props.accessibilityRole === "checkbox"
    );
    expect(checkbox.props.accessibilityLabel).toBe("Partner goal");
    expect(checkbox.props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
  });

  it("renders mutation and edit affordances for interactive rows", () => {
    const onToggle = vi.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ChecklistGoalRow
          title="Viewer goal"
          category="Health"
          done={false}
          interactive
          href="/goals/goal-1"
          onToggle={onToggle}
        />
      );
    });

    const pressables = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "pressable"
    );
    const links = root.root.findAll(
      (node: ReactTestInstance) => String(node.type) === "link"
    );

    expect(pressables).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(pressables[0]?.props.accessibilityRole).toBe("checkbox");
    expect(pressables[0]?.props.accessibilityLabel).toBe("Viewer goal");
    expect(pressables[0]?.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
    });

    act(() => {
      pressables[0]?.props.onPress();
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
