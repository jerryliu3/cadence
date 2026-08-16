"use client";

import { Bell, BellOff, Clock3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatHour,
  getScheduleToggleLabel,
  type NotificationSchedule,
} from "@/features/settings/notification-schedule-utils";

interface NotificationScheduleSectionProps {
  timezone: string;
  hour: string;
  onHourChange: (value: string) => void;
  message: string;
  onMessageChange: (value: string) => void;
  canAddSchedule: boolean;
  savingSchedule: boolean;
  onAddSchedule: () => void;
  loadingSchedules: boolean;
  schedules: NotificationSchedule[];
  pendingScheduleId: string | null;
  onToggleSchedule: (schedule: NotificationSchedule) => void;
  onDeleteSchedule: (schedule: NotificationSchedule) => void;
  defaultNotificationHour: number;
  defaultMessage: string;
}

export function NotificationScheduleSection({
  timezone,
  hour,
  onHourChange,
  message,
  onMessageChange,
  canAddSchedule,
  savingSchedule,
  onAddSchedule,
  loadingSchedules,
  schedules,
  pendingScheduleId,
  onToggleSchedule,
  onDeleteSchedule,
  defaultNotificationHour,
  defaultMessage,
}: NotificationScheduleSectionProps) {
  return (
    <section className="space-y-5 border-t pt-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-medium">
          <Clock3 className="size-5" />
          Daily reminders
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A {formatHour(defaultNotificationHour)} reminder is enabled by default in your local
          timezone. Disable it below or add more reminders. New reminders use {timezone}.
        </p>
      </div>
      <div className="grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="notification-hour">Time</Label>
          <Select value={hour} onValueChange={onHourChange}>
            <SelectTrigger id="notification-hour" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, value) => (
                <SelectItem key={value} value={String(value)}>
                  {formatHour(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="notification-message">Message</Label>
          <Input
            id="notification-message"
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            maxLength={180}
            placeholder={defaultMessage}
          />
        </div>

        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={onAddSchedule}
          disabled={savingSchedule || !canAddSchedule}
        >
          {savingSchedule ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </div>

      {loadingSchedules ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <LoaderCircle className="mr-2 animate-spin" />
          Loading reminders…
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No daily reminders yet.
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => {
            const pending = pendingScheduleId === schedule.id;

            return (
              <div
                key={schedule.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-28">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{formatHour(schedule.hour)}</p>
                    {schedule.is_default ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{schedule.timezone}</p>
                </div>
                <p
                  className={`min-w-0 flex-1 break-words text-sm ${
                    schedule.enabled ? "" : "text-muted-foreground line-through"
                  }`}
                >
                  {schedule.message}
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => onToggleSchedule(schedule)}
                    disabled={pending}
                  >
                    {schedule.enabled ? <BellOff /> : <Bell />}
                    {getScheduleToggleLabel(schedule)}
                  </Button>
                  {!schedule.is_default ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`Delete ${formatHour(schedule.hour)} reminder`}
                      onClick={() => onDeleteSchedule(schedule)}
                      disabled={pending}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
