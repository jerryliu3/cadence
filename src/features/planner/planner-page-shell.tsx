"use client";

import { CalendarDays, ListChecks, NotebookPen } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { CalendarPageShell } from "@/features/planner/calendar-page-shell";
import { ChecklistShell } from "@/features/today/checklist-shell";
import { TasksTab } from "@/features/tasks/tasks-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientSearchParamsUpdater } from "@/lib/navigation/use-client-search-params-updater";
import { cn } from "@/lib/utils";

type PlannerSurface = "calendar" | "checklist" | "tasks";

const plannerSurfaceTriggerBaseClass =
  "h-11 min-w-0 flex-row gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[inset_0_2px_6px_rgba(15,23,42,0.22)] data-[state=active]:translate-y-[3px] data-[state=active]:shadow-[inset_0_2px_6px_rgba(15,23,42,0.22)] data-[state=active]:hover:translate-y-[3px] data-[state=active]:cursor-default after:hidden";

const plannerSurfaceTriggerToneClasses: Record<PlannerSurface, string> = {
  calendar:
    "border border-sky-300/70 bg-gradient-to-b from-sky-100/95 to-sky-50/90 text-sky-900 shadow-[0_3px_0_rgba(14,116,144,0.28)] data-[state=active]:border-sky-500 data-[state=active]:from-sky-200 data-[state=active]:to-sky-100 dark:border-sky-500/50 dark:from-sky-900/80 dark:to-sky-800/70 dark:text-sky-100 dark:data-[state=active]:border-sky-300 dark:data-[state=active]:from-sky-700/80 dark:data-[state=active]:to-sky-600/70",
  checklist:
    "border border-emerald-300/70 bg-gradient-to-b from-emerald-100/95 to-emerald-50/90 text-emerald-900 shadow-[0_3px_0_rgba(5,150,105,0.28)] data-[state=active]:border-emerald-500 data-[state=active]:from-emerald-200 data-[state=active]:to-emerald-100 dark:border-emerald-500/50 dark:from-emerald-900/80 dark:to-emerald-800/70 dark:text-emerald-100 dark:data-[state=active]:border-emerald-300 dark:data-[state=active]:from-emerald-700/80 dark:data-[state=active]:to-emerald-600/70",
  tasks:
    "border border-amber-300/70 bg-gradient-to-b from-amber-100/95 to-amber-50/90 text-amber-900 shadow-[0_3px_0_rgba(180,83,9,0.28)] data-[state=active]:border-amber-500 data-[state=active]:from-amber-200 data-[state=active]:to-amber-100 dark:border-amber-500/50 dark:from-amber-900/80 dark:to-amber-800/70 dark:text-amber-100 dark:data-[state=active]:border-amber-300 dark:data-[state=active]:from-amber-700/80 dark:data-[state=active]:to-amber-600/70",
};

export function PlannerPageShell() {
  const searchParams = useSearchParams();
  const { applySearchParams } = useClientSearchParamsUpdater();
  const surfaceParam = searchParams.get("surface");
  const surface: PlannerSurface =
    surfaceParam === "checklist"
      ? "checklist"
      : surfaceParam === "tasks"
        ? "tasks"
        : "calendar";

  return (
    <Tabs
      value={surface}
      onValueChange={(value) => {
        const nextSurface: PlannerSurface =
          value === "checklist"
            ? "checklist"
            : value === "tasks"
              ? "tasks"
              : "calendar";
        applySearchParams((params) => {
          params.delete("tab");
          if (nextSurface === "calendar") {
            params.delete("surface");
          } else if (nextSurface === "checklist") {
            params.set("surface", "checklist");
          } else {
            params.set("surface", "tasks");
          }
        }, "push");
      }}
      className="flex flex-col gap-4"
    >
      <TabsList
        variant="line"
        className="grid w-full grid-cols-3 gap-2 rounded-2xl bg-transparent p-0"
      >
        <TabsTrigger
          value="calendar"
          className={cn(
            plannerSurfaceTriggerBaseClass,
            plannerSurfaceTriggerToneClasses.calendar
          )}
        >
          <CalendarDays className="size-4" />
          Calendar
        </TabsTrigger>
        <TabsTrigger
          value="checklist"
          className={cn(
            plannerSurfaceTriggerBaseClass,
            plannerSurfaceTriggerToneClasses.checklist
          )}
        >
          <ListChecks className="size-4" />
          Checklist
        </TabsTrigger>
        <TabsTrigger
          value="tasks"
          className={cn(
            plannerSurfaceTriggerBaseClass,
            plannerSurfaceTriggerToneClasses.tasks
          )}
        >
          <NotebookPen className="size-4" />
          To-Do
        </TabsTrigger>
      </TabsList>

      <TabsContent value="calendar">
        <CalendarPageShell />
      </TabsContent>
      <TabsContent value="checklist">
        <ChecklistShell />
      </TabsContent>
      <TabsContent value="tasks">
        <TasksTab />
      </TabsContent>
    </Tabs>
  );
}
