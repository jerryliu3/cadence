import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { UserAvatar } from "./user-avatar";

vi.mock("react-native", () => ({
  Image: ({ onError }: { onError?: () => void }) =>
    React.createElement("image", { onError }),
  Pressable: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: (event: { stopPropagation?: () => void }) => void;
  }) => React.createElement("pressable", { onPress }, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("text", null, children),
  View: ({ children }: { children: React.ReactNode }) =>
    React.createElement("view", null, children),
  StyleSheet: { create: <T,>(styles: T) => styles },
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#000",
      card: "#111",
      mutedForeground: "#777",
    },
  }),
}));

describe("UserAvatar", () => {
  it("falls back to initials when image load fails", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <UserAvatar
          avatarUrl="https://example.com/broken.jpg"
          displayName="Alex"
          username={null}
        />
      );
    });

    const imageNode = root.root.findByType("image");
    act(() => {
      imageNode.props.onError?.();
    });

    const textNodes = root.root.findAllByType("text");
    expect(textNodes.some((node) => String(node.props.children).includes("AL"))).toBe(true);
  });

  it("calls onPress when interactive avatar is pressed", () => {
    let root!: ReactTestRenderer;
    const onPress = vi.fn();
    act(() => {
      root = create(
        <UserAvatar
          avatarUrl={null}
          displayName="Alex"
          username={null}
          onPress={onPress}
        />
      );
    });

    const pressableNode = root.root.findByType("pressable");
    act(() => {
      pressableNode.props.onPress?.({});
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
