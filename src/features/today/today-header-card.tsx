"use client";

import { format, isValid, parseISO } from "date-fns";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { PeriodStepper } from "@/components/ui/period-stepper";

interface TodayHeaderCardProps {
  viewDate: string;
  todayLocalDate: string;
  viewingToday: boolean;
  onViewDateChange: (value: string) => void;
  onGoToPreviousDate: () => void;
  onGoToNextDate: () => void;
  onResetToToday: () => void;
  datePickerControls?: ReactNode;
  searchControls?: ReactNode;
  quickFilterControls?: ReactNode;
  children?: ReactNode;
}

export function TodayHeaderCard({
  viewDate,
  todayLocalDate,
  viewingToday,
  onViewDateChange,
  onGoToPreviousDate,
  onGoToNextDate,
  onResetToToday,
  datePickerControls,
  searchControls,
  quickFilterControls,
  children,
}: TodayHeaderCardProps) {
  const parsedViewDate = parseISO(viewDate);
  const weekdayTitle = isValid(parsedViewDate)
    ? format(parsedViewDate, "EEEE")
    : "Today";

  return (
    <Card className="rounded-xl border bg-card py-3 shadow-sm sm:py-4 sm:ring-1">
      <CardHeader className="pb-3">
        <div className="min-w-0">
          <div className="flex w-full flex-col gap-2">
            <div
              data-title-date-row="true"
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 sm:gap-2"
            >
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <CardTitle className="whitespace-nowrap">{weekdayTitle}</CardTitle>
              </div>
              <div className="min-w-0 justify-self-center">
                <PeriodStepper
                  className="min-w-0 gap-1 sm:gap-2"
                  onPrevious={onGoToPreviousDate}
                  onNext={onGoToNextDate}
                  center={
                    <DateField
                      value={viewDate}
                      onValueChange={(value) => onViewDateChange(value || todayLocalDate)}
                      aria-label="Checklist date"
                      className="w-[8.75rem] sm:w-[170px]"
                    />
                  }
                  previousAriaLabel="Previous day"
                  nextAriaLabel="Next day"
                />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
                {datePickerControls ? <div className="shrink-0">{datePickerControls}</div> : null}
              </div>
            </div>
            {!viewingToday ? (
              <div className="flex justify-center">
                <Button type="button" variant="ghost" size="sm" onClick={onResetToToday}>
                  Today
                </Button>
              </div>
            ) : null}
            {searchControls ? <div className="w-full">{searchControls}</div> : null}
          </div>
          {quickFilterControls ? (
            <div className="mt-2">{quickFilterControls}</div>
          ) : null}
        </div>
      </CardHeader>
      {children ? <CardContent className="space-y-3 pt-0">{children}</CardContent> : null}
    </Card>
  );
}
