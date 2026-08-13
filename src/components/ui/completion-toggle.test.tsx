import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionToggle } from "@/components/ui/completion-toggle";

const originalVibrate = Object.getOwnPropertyDescriptor(
  window.navigator,
  "vibrate"
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it("keeps optimistic completed state visible until the completed prop catches up", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <CompletionToggle
        completed={false}
        pending
        aria-label="Mark session done"
      />
    );

    const toggle = screen.getByRole("button", { name: "Mark session done" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-visual-completed", "true");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(toggle).toHaveAttribute("data-visual-completed", "true");

    rerender(
      <CompletionToggle
        completed
        pending={false}
        aria-label="Mark session done"
      />
    );
    expect(toggle).toHaveAttribute("data-visual-completed", "true");
    expect(toggle).toHaveAttribute("data-completed", "true");

    vi.useRealTimers();
  });

  it("keeps an optimistic uncheck until the completed prop catches up", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <CompletionToggle
        completed
        pending
        aria-label="Mark session not done"
      />
    );

    const toggle = screen.getByRole("button", {
      name: "Mark session not done",
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-visual-completed", "false");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(toggle).toHaveAttribute("data-visual-completed", "false");

    rerender(
      <CompletionToggle
        completed={false}
        pending={false}
        aria-label="Mark session not done"
      />
    );
    expect(toggle).toHaveAttribute("data-visual-completed", "false");
    expect(toggle).toHaveAttribute("data-completed", "false");

    vi.useRealTimers();
  });

  it("reverts optimistic state when pending ends without a matching completed prop", () => {
    const { rerender } = render(
      <CompletionToggle
        completed={false}
        aria-label="Mark session done"
      />
    );

    const toggle = screen.getByRole("button", { name: "Mark session done" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-visual-completed", "true");

    rerender(
      <CompletionToggle
        completed={false}
        pending
        aria-label="Mark session done"
      />
    );
    expect(toggle).toHaveAttribute("data-visual-completed", "true");

    rerender(
      <CompletionToggle
        completed={false}
        pending={false}
        aria-label="Mark session done"
      />
    );
    expect(toggle).toHaveAttribute("data-visual-completed", "false");
  });

  it("suppresses haptics when the user requests reduced motion", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })
    );

    render(
      <CompletionToggle
        completed={false}
        aria-label="Mark session done"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark session done" }));

    expect(vibrate).not.toHaveBeenCalled();
  });
});
