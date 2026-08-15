import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("ActivityIndicator", props),
  Pressable: (props: Record<string, unknown>) =>
    React.createElement("Pressable", props),
  SafeAreaView: (props: Record<string, unknown>) =>
    React.createElement("SafeAreaView", props),
  ScrollView: (props: Record<string, unknown>) =>
    React.createElement("ScrollView", props),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: (props: Record<string, unknown>) =>
    React.createElement("Text", props),
  View: (props: Record<string, unknown>) =>
    React.createElement("View", props),
}));
vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#00f",
      primaryForeground: "#fff",
      foreground: "#111",
      background: "#fff",
    },
  }),
}));

import { PrimaryButton } from "./button";
import { Screen } from "./screen";

describe("mobile shared accessibility semantics", () => {
  it("labels primary buttons and screen headings", () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        <Screen title="Checklist">
          <PrimaryButton label="Save" disabled onPress={() => undefined} />
        </Screen>
      );
    });

    const button = root.root.find(
      (node: ReactTestInstance) => String(node.type) === "Pressable"
    );
    const header = root.root.find(
      (node: ReactTestInstance) =>
        node.props.accessibilityRole === "header"
    );

    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Save");
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(header.props.children).toBe("Checklist");
  });
});
