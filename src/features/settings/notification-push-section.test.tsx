import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NotificationPushSection,
  type PushStatus,
} from "@/features/settings/notification-push-section";

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<Parameters<typeof NotificationPushSection>[0]> = {}) {
  return {
    pushStatus: "unsubscribed" as PushStatus,
    pushSubscription: null,
    changingPushStatus: false,
    isIOS: false,
    isStandalone: false,
    onEnablePush: vi.fn(),
    onDisablePush: vi.fn(),
    ...overrides,
  };
}

describe("NotificationPushSection", () => {
  it("shows the Enable button and status copy when unsubscribed", () => {
    render(<NotificationPushSection {...baseProps({ pushStatus: "unsubscribed" })} />);

    expect(screen.getByText("Push notifications are off on this device.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disable/i })).not.toBeInTheDocument();
  });

  it("shows the Disable button when a push subscription exists", () => {
    render(
      <NotificationPushSection
        {...baseProps({
          pushStatus: "subscribed",
          pushSubscription: {} as PushSubscription,
        })}
      />
    );

    expect(screen.getByText("Push notifications are on for this device.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();
  });

  it("disables Enable unless status is exactly unsubscribed", () => {
    const { rerender } = render(
      <NotificationPushSection {...baseProps({ pushStatus: "checking" })} />
    );
    expect(screen.getByRole("button", { name: /enable/i })).toBeDisabled();

    rerender(<NotificationPushSection {...baseProps({ pushStatus: "unsubscribed" })} />);
    expect(screen.getByRole("button", { name: /enable/i })).not.toBeDisabled();
  });

  it("disables both buttons while changingPushStatus is true", () => {
    const { rerender } = render(
      <NotificationPushSection
        {...baseProps({ pushStatus: "unsubscribed", changingPushStatus: true })}
      />
    );
    expect(screen.getByRole("button", { name: /enable/i })).toBeDisabled();

    rerender(
      <NotificationPushSection
        {...baseProps({
          pushStatus: "subscribed",
          pushSubscription: {} as PushSubscription,
          changingPushStatus: true,
        })}
      />
    );
    expect(screen.getByRole("button", { name: /disable/i })).toBeDisabled();
  });

  it("calls onEnablePush and onDisablePush", async () => {
    const onEnablePush = vi.fn();
    const onDisablePush = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <NotificationPushSection {...baseProps({ onEnablePush, onDisablePush })} />
    );

    await user.click(screen.getByRole("button", { name: /enable/i }));
    expect(onEnablePush).toHaveBeenCalledTimes(1);

    rerender(
      <NotificationPushSection
        {...baseProps({
          pushSubscription: {} as PushSubscription,
          onEnablePush,
          onDisablePush,
        })}
      />
    );
    await user.click(screen.getByRole("button", { name: /disable/i }));
    expect(onDisablePush).toHaveBeenCalledTimes(1);
  });

  it("shows the iOS install hint only on iOS and not already standalone", () => {
    const { rerender } = render(
      <NotificationPushSection {...baseProps({ isIOS: true, isStandalone: false })} />
    );
    expect(screen.getByText(/add goalmaxxing to your home screen/i)).toBeInTheDocument();

    rerender(<NotificationPushSection {...baseProps({ isIOS: true, isStandalone: true })} />);
    expect(screen.queryByText(/add goalmaxxing to your home screen/i)).not.toBeInTheDocument();

    rerender(<NotificationPushSection {...baseProps({ isIOS: false, isStandalone: false })} />);
    expect(screen.queryByText(/add goalmaxxing to your home screen/i)).not.toBeInTheDocument();
  });

  it("shows the denied-permission hint only when status is denied", () => {
    const { rerender } = render(
      <NotificationPushSection {...baseProps({ pushStatus: "denied" })} />
    );
    expect(screen.getByText(/allow notifications for goalmaxxing/i)).toBeInTheDocument();

    rerender(<NotificationPushSection {...baseProps({ pushStatus: "unsubscribed" })} />);
    expect(screen.queryByText(/allow notifications for goalmaxxing/i)).not.toBeInTheDocument();
  });

  it.each([
    ["checking", "Checking this device…"],
    ["unsupported", "Push notifications are not available in this browser."],
    ["subscription-error", "This browser is subscribed, but the server could not register this device."],
    ["not-configured", "Push notifications have not been configured for this deployment."],
  ] as const)("shows the correct copy for status %s", (pushStatus, expectedCopy) => {
    render(<NotificationPushSection {...baseProps({ pushStatus })} />);
    expect(screen.getByText(expectedCopy)).toBeInTheDocument();
  });
});
