"use client";

import { format } from "date-fns";
import { ListPlus, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PeriodStepper } from "@/components/ui/period-stepper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GoalListControls } from "@/features/goals/goal-list-controls";
import type { Goal } from "@/lib/goals/types";
import type { GoalDateSort } from "@/lib/goals/list-view";

export type RecurrenceFilter = "all" | "daily" | "weekly" | "monthly" | "fixed";

interface TodayHeaderCardProps {
  viewDateObj: Date;
  viewDate: string;
  todayLocalDate: string;
  viewingToday: boolean;
  onViewDateChange: (value: string) => void;
  onGoToPreviousDate: () => void;
  onGoToNextDate: () => void;
  onResetToToday: () => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  recurrenceFilter: RecurrenceFilter;
  onRecurrenceFilterChange: (value: RecurrenceFilter) => void;
  availableCategories: string[];
  allCategoriesFilterValue: string;
  goals: Goal[];
  referenceMonth: string;
  endMonth: string | null;
  onEndMonthChange: (value: string | null) => void;
  sort: GoalDateSort;
  onSortChange: (value: GoalDateSort) => void;
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
  categoryFilter,
  onCategoryFilterChange,
  recurrenceFilter,
  onRecurrenceFilterChange,
  availableCategories,
  allCategoriesFilterValue,
  goals,
  referenceMonth,
  endMonth,
  onEndMonthChange,
  sort,
  onSortChange,
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
            <div className="flex shrink-0 flex-col gap-2 sm:mr-2 sm:flex-row">
              <Button variant="outline" asChild>
                <Link href="/goals/bulk">
                  <ListPlus className="size-4" />
                  New bulk goal
                </Link>
              </Button>
              <Button asChild>
                <Link href="/goals/new">
                  <Plus className="size-4" />
                  New goal
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
            <div className="flex shrink-0 items-center gap-2">
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
              {!viewingToday ? (
                <Button type="button" variant="ghost" size="sm" onClick={onResetToToday}>
                  Today
                </Button>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
                <SelectTrigger className="h-8 w-[170px] rounded-full bg-background/90 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allCategoriesFilterValue}>All Categories</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={recurrenceFilter} onValueChange={onRecurrenceFilterChange}>
                <SelectTrigger className="h-8 w-[190px] rounded-full bg-background/90 text-xs">
                  <SelectValue placeholder="Recurrence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Recurrences</SelectItem>
                  <SelectItem value="daily">Daily Recurrences</SelectItem>
                  <SelectItem value="weekly">Weekly Recurrences</SelectItem>
                  <SelectItem value="monthly">Monthly Recurrences</SelectItem>
                  <SelectItem value="fixed">Milestone Goals</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <GoalListControls
            goals={goals}
            referenceMonth={referenceMonth}
            endMonth={endMonth}
            onEndMonthChange={onEndMonthChange}
            sort={sort}
            onSortChange={onSortChange}
            className="mt-2"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">{children}</CardContent>
    </Card>
  );
}
