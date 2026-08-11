"use client";

import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PeriodStepper } from "@/components/ui/period-stepper";

interface TodayHeaderCardProps {
  viewDateObj: Date;
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
  viewDateObj,
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
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <CardTitle className="text-xl">Today</CardTitle>
              </div>
              <CardDescription>{format(viewDateObj, "EEEE, MMMM d")}</CardDescription>
            </div>
          </div>
          <div className="mt-2 w-fit max-w-full space-y-2">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
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
              {datePickerControls ? (
                <div className="shrink-0">{datePickerControls}</div>
              ) : null}
              {!viewingToday ? (
                <Button type="button" variant="ghost" size="sm" onClick={onResetToToday}>
                  Today
                </Button>
              ) : null}
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
