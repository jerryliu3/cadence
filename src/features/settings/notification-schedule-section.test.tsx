import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationScheduleSection } from "@/features/settings/notification-schedule-section";
import {
  formatHour,
  type NotificationSchedule,
} from "@/features/settings/notification-schedule-utils";

afterEach(() => {
  cleanup();
});

function buildSchedule(overrides: Partial<NotificationSchedule> = {}): NotificationSchedule {
  return {
    id: "schedule-1",
    user_id: "user-1",
    hour: 9,
    timezone: "America/New_York",
    message: "Time to work on your goals",
    enabled: true,
    is_default: false,
    last_sent_local_date: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof NotificationScheduleSection>[0]> = {}) {
  return {
    timezone: "America/New_York",
    hour: "9",
    onHourChange: vi.fn(),
    message: "",
    onMessageChange: vi.fn(),
    canAddSchedule: true,
    savingSchedule: false,
    onAddSchedule: vi.fn(),
    loadingSchedules: false,
    schedules: [],
    pendingScheduleId: null,
    onToggleSchedule: vi.fn(),
    onDeleteSchedule: vi.fn(),
    defaultNotificationHour: 9,
    defaultMessage: "Don't forget your goals!",
    ...overrides,
  };
}

describe("NotificationScheduleSection", () => {
  it("shows the default-hour reminder copy and the target timezone", () => {
    render(<NotificationScheduleSection {...baseProps({ defaultNotificationHour: 9 })} />);

    expect(
      screen.getByText(new RegExp(`${formatHour(9)} reminder is enabled by default`))
    ).toBeInTheDocument();
  });

  it("shows a loading indicator while schedules are loading", () => {
    render(<NotificationScheduleSection {...baseProps({ loadingSchedules: true })} />);

    expect(screen.getByText("Loading reminders…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no schedules", () => {
    render(<NotificationScheduleSection {...baseProps({ schedules: [] })} />);

    expect(screen.getByText("No daily reminders yet.")).toBeInTheDocument();
  });

  it("renders a schedule row with its hour, timezone, and message", () => {
    const schedule = buildSchedule({ hour: 14, timezone: "UTC", message: "Go run" });
    render(<NotificationScheduleSection {...baseProps({ schedules: [schedule] })} />);

    expect(screen.getByText(formatHour(14))).toBeInTheDocument();
    expect(screen.getByText("UTC")).toBeInTheDocument();
    expect(screen.getByText("Go run")).toBeInTheDocument();
  });

  it("shows a Default badge only for default schedules", () => {
    const defaultSchedule = buildSchedule({ id: "s1", is_default: true });
    const { rerender } = render(
      <NotificationScheduleSection {...baseProps({ schedules: [defaultSchedule] })} />
    );
    expect(screen.getByText("Default")).toBeInTheDocument();

    const customSchedule = buildSchedule({ id: "s2", is_default: false });
    rerender(<NotificationScheduleSection {...baseProps({ schedules: [customSchedule] })} />);
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  it("hides the delete button for default schedules but shows it for custom ones", () => {
    const defaultSchedule = buildSchedule({ id: "s1", hour: 9, is_default: true });
    const { rerender } = render(
      <NotificationScheduleSection {...baseProps({ schedules: [defaultSchedule] })} />
    );
    expect(
      screen.queryByRole("button", { name: `Delete ${formatHour(9)} reminder` })
    ).not.toBeInTheDocument();

    const customSchedule = buildSchedule({ id: "s2", hour: 10, is_default: false });
    rerender(<NotificationScheduleSection {...baseProps({ schedules: [customSchedule] })} />);
    expect(
      screen.getByRole("button", { name: `Delete ${formatHour(10)} reminder` })
    ).toBeInTheDocument();
  });

  it("uses Disable/Enable copy for default schedules and Pause/Resume for custom ones", () => {
    const enabledDefault = buildSchedule({ id: "s1", is_default: true, enabled: true });
    const { rerender } = render(
      <NotificationScheduleSection {...baseProps({ schedules: [enabledDefault] })} />
    );
    expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();

    const disabledCustom = buildSchedule({ id: "s2", is_default: false, enabled: false });
    rerender(<NotificationScheduleSection {...baseProps({ schedules: [disabledCustom] })} />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("applies strikethrough styling to disabled schedule messages", () => {
    const disabled = buildSchedule({ enabled: false, message: "Go run" });
    render(<NotificationScheduleSection {...baseProps({ schedules: [disabled] })} />);

    expect(screen.getByText("Go run")).toHaveClass("line-through");
  });

  it("calls onToggleSchedule and onDeleteSchedule with the schedule", async () => {
    const onToggleSchedule = vi.fn();
    const onDeleteSchedule = vi.fn();
    const user = userEvent.setup();
    const schedule = buildSchedule({ id: "s1", hour: 9, is_default: false });

    render(
      <NotificationScheduleSection
        {...baseProps({ schedules: [schedule], onToggleSchedule, onDeleteSchedule })}
      />
    );

    await user.click(screen.getByRole("button", { name: /pause/i }));
    expect(onToggleSchedule).toHaveBeenCalledWith(schedule);

    await user.click(screen.getByRole("button", { name: `Delete ${formatHour(9)} reminder` }));
    expect(onDeleteSchedule).toHaveBeenCalledWith(schedule);
  });

  it("disables toggle/delete buttons while that schedule is pending", () => {
    const schedule = buildSchedule({ id: "s1", is_default: false });
    render(
      <NotificationScheduleSection
        {...baseProps({ schedules: [schedule], pendingScheduleId: "s1" })}
      />
    );

    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: `Delete ${formatHour(schedule.hour)} reminder` })
    ).toBeDisabled();
  });

  it("disables the Add button when adding is not allowed or already saving", () => {
    const { rerender } = render(
      <NotificationScheduleSection {...baseProps({ canAddSchedule: false })} />
    );
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();

    rerender(<NotificationScheduleSection {...baseProps({ savingSchedule: true })} />);
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });

  it("calls onAddSchedule and onMessageChange", async () => {
    const onAddSchedule = vi.fn();
    const onMessageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NotificationScheduleSection {...baseProps({ onAddSchedule, onMessageChange })} />
    );

    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(onAddSchedule).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText("Message"), "x");
    expect(onMessageChange).toHaveBeenCalled();
  });
});
