"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { PeriodStepper } from "@/components/ui/period-stepper";

interface TodayHeaderCardProps {
  title?: string;
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
  children: ReactNode;
}

export function TodayHeaderCard({
  title = "Today",
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
  return (
    <Card className="rounded-none border-0 bg-transparent py-0 shadow-none ring-0 sm:rounded-xl sm:bg-card sm:py-4 sm:ring-1 sm:shadow-sm">
      <CardHeader className="pb-3">
        <div className="min-w-0">
          <div className="flex w-full flex-col gap-2">
            <div
              data-title-date-row="true"
              className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <CardTitle className="text-xl">{title}</CardTitle>
              </div>
              <div className="justify-self-center">
                <PeriodStepper
                  onPrevious={onGoToPreviousDate}
                  onNext={onGoToNextDate}
                  center={
                    <DateField
                      value={viewDate}
                      onValueChange={(value) => onViewDateChange(value || todayLocalDate)}
                    />
                  }
                  previousAriaLabel="Previous day"
                  nextAriaLabel="Next day"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                {datePickerControls ? <div className="shrink-0">{datePickerControls}</div> : null}
                {!viewingToday ? (
                  <Button type="button" variant="ghost" size="sm" onClick={onResetToToday}>
                    Today
                  </Button>
                ) : null}
              </div>
            </div>
            {searchControls ? <div className="w-full">{searchControls}</div> : null}
          </div>
          {quickFilterControls ? (
            <div className="mt-2">{quickFilterControls}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">{children}</CardContent>
    </Card>
  );
}
