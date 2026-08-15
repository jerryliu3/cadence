import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  manipulate: vi.fn(),
  pickImage: vi.fn(),
  invalidateQueries: vi.fn(),
  back: vi.fn(),
}));

vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    Text: (props: Record<string, unknown>) =>
      ReactModule.createElement("Text", props),
    TextInput: (props: Record<string, unknown>) =>
      ReactModule.createElement("TextInput", props),
    View: (props: Record<string, unknown>) =>
      ReactModule.createElement("View", props),
  };
});
vi.mock("expo-router", () => ({ router: { back: mocks.back } }));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: mocks.manipulate,
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mocks.pickImage,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@cadence/shared/ids", () => ({
  createClientUuid: () => GOAL_ID,
}));
vi.mock("../../lib/session", () => ({
  useSession: () => ({ userId: "user-1" }),
}));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      foreground: "#111",
      mutedForeground: "#777",
      border: "#ccc",
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
    Screen: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement("Screen", null, children),
  };
});
vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    storage: {
      from: () => ({ upload: mocks.upload }),
    },
    from: vi.fn(),
  },
}));

import { GoalFormScreen } from "./GoalFormScreen";

function findButton(root: ReactTestInstance, label: string) {
  return root
    .findAll((node) => String(node.type) === "PrimaryButton")
    .find(
    (button) => button.props.label === label
  );
}

describe("GoalFormScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.upload
      .mockResolvedValueOnce({ error: new Error("upload failed") })
      .mockResolvedValueOnce({ error: null });
    mocks.manipulate.mockResolvedValue({ base64: "QQ==" });
    mocks.pickImage.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///goal.jpg" }],
    });
    mocks.invalidateQueries.mockResolvedValue(undefined);
  });

  it("retries a failed photo upload without creating the goal again", async () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<GoalFormScreen />);
    });
    const root = renderer!.root;

    act(() => {
      root
        .find((node) => String(node.type) === "TextInput")
        .props.onChangeText("New goal");
    });
    await act(async () => {
      await findButton(root, "Add photo")!.props.onPress();
    });
    await act(async () => {
      await findButton(root, "Save")!.props.onPress();
    });

    expect(findButton(root, "Retry photo")).toBeDefined();

    await act(async () => {
      await findButton(root, "Retry photo")!.props.onPress();
    });

    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === "create_goal")
    ).toHaveLength(1);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0]?.[0]).toContain(`/${GOAL_ID}/`);
    expect(mocks.upload.mock.calls[1]?.[0]).toContain(`/${GOAL_ID}/`);
    expect(mocks.back).toHaveBeenCalledOnce();

    act(() => renderer?.unmount());
  });
});
