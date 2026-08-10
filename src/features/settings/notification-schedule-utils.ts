export interface NotificationSchedule {
  id: string;
  user_id: string;
  hour: number;
  timezone: string;
  message: string;
  enabled: boolean;
  is_default: boolean;
  last_sent_local_date: string | null;
  created_at: string;
  updated_at: string;
}

export function formatHour(hour: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2020, 0, 1, hour));
}

export function sortSchedules(schedules: NotificationSchedule[]): NotificationSchedule[] {
  return [...schedules].sort((left, right) => {
    if (left.hour !== right.hour) {
      return left.hour - right.hour;
    }

    if (left.is_default !== right.is_default) {
      return left.is_default ? -1 : 1;
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

export function getScheduleToggleLabel(schedule: NotificationSchedule): string {
  if (schedule.is_default) {
    return schedule.enabled ? "Disable" : "Enable";
  }

  return schedule.enabled ? "Pause" : "Resume";
}
