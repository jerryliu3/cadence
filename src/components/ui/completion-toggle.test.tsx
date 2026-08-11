import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionToggle } from "@/components/ui/completion-toggle";

const originalVibrate = Object.getOwnPropertyDescriptor(
  window.navigator,
  "vibrate"
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalVibrate) {
    Object.defineProperty(window.navigator, "vibrate", originalVibrate);
  } else {
    Reflect.deleteProperty(window.navigator, "vibrate");
  }
});

describe("CompletionToggle", () => {
  it("exposes completion state and forwards clicks", () => {
    const onClick = vi.fn();

    render(
      <CompletionToggle
        completed
        aria-label="Mark session not done"
        onClick={onClick}
      />
    );

    const toggle = screen.getByRole("button", {
      name: "Mark session not done",
    });
    expect(toggle).toHaveAttribute("data-completed", "true");

    fireEvent.click(toggle);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("uses best-effort haptic feedback when supported", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    render(
      <CompletionToggle
        completed={false}
        aria-label="Mark session done"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mark session done",
      })
    );

    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("does not fire interaction feedback while disabled", () => {
    const vibrate = vi.fn(() => true);
    const onClick = vi.fn();
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    render(
      <CompletionToggle
        completed={false}
        aria-label="Mark session done"
        disabled
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark session done" }));

    expect(vibrate).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
