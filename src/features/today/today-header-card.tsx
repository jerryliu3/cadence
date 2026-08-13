"use client";

import { format, isValid, parseISO } from "date-fns";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const parsedViewDate = parseISO(viewDate);
  const viewDateLabel = isValid(parsedViewDate)
    ? format(parsedViewDate, "EEE MMM d, yyyy")
    : viewDate;

  return (
    <Card className="rounded-none border-0 bg-transparent py-0 shadow-none ring-0 sm:rounded-xl sm:bg-card sm:py-4 sm:ring-1 sm:shadow-sm">
      <CardHeader className="pb-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <CardTitle className="text-xl">{title}</CardTitle>
              </div>
            </div>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2">
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
              <div className="col-start-2 justify-self-center">
                <PeriodStepper
                  onPrevious={onGoToPreviousDate}
                  onNext={onGoToNextDate}
                  center={
                    <Input
                      type="date"
                      value={viewDate}
                      onChange={(event) => onViewDateChange(event.target.value || todayLocalDate)}
                      className="h-8 w-[170px]"
                    />
                  }
                  previousAriaLabel="Previous day"
                  nextAriaLabel="Next day"
                />
              </div>
              {datePickerControls || !viewingToday ? (
                <div className="col-start-3 ml-2 flex items-center gap-2 justify-self-start">
                  {datePickerControls ? <div className="shrink-0">{datePickerControls}</div> : null}
                  {!viewingToday ? (
                    <Button type="button" variant="ghost" size="sm" onClick={onResetToToday}>
                      Today
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="text-center text-xs font-medium text-muted-foreground">{viewDateLabel}</p>
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
