"use client";

import { CalendarDays, ListChecks, NotebookPen } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientSearchParamsUpdater } from "@/lib/navigation/use-client-search-params-updater";
import { cn } from "@/lib/utils";

const PlannerSurfaceFallback = () => (
  <div className="rounded-2xl border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground">
    Loading planner surface...
  </div>
);

const CalendarPageShell = dynamic(
  () =>
    import("@/features/planner/calendar-page-shell").then(
      (module) => module.CalendarPageShell
    ),
  {
    loading: PlannerSurfaceFallback,
  }
);

const ChecklistShell = dynamic(
  () =>
    import("@/features/today/checklist-shell").then(
      (module) => module.ChecklistShell
    ),
  {
    loading: PlannerSurfaceFallback,
  }
);

const TasksTab = dynamic(
  () => import("@/features/tasks/tasks-tab").then((module) => module.TasksTab),
  {
    loading: PlannerSurfaceFallback,
  }
);

type PlannerSurface = "calendar" | "checklist" | "tasks";

const plannerSurfaceTriggerBaseClass =
  "h-10 min-w-0 flex-col gap-0.5 rounded-xl px-1.5 py-1 text-[10px] font-semibold leading-tight transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-[3px] data-[state=active]:translate-y-[3px] data-[state=active]:hover:translate-y-[3px] data-[state=active]:cursor-default after:hidden";

// Saved alternate (former Calendar): blue-300 border, a blue-100/blue-50
// gradient, and blue-300/blue-100 when selected, with a
// rgba(37, 99, 235, 0.28) raised shadow.
const plannerSurfaceTriggerToneClass =
  "border border-blue-300/80 bg-gradient-to-b from-blue-200/95 via-blue-100/95 to-blue-50/90 text-blue-900 shadow-[0_3px_0_rgba(37,99,235,0.24)] data-[state=active]:border-blue-500 data-[state=active]:from-blue-300/95 data-[state=active]:via-blue-200/95 data-[state=active]:to-blue-100";

const selectedChipShadow =
  "inset 0 4px 7px rgba(15, 23, 42, 0.3), inset 2px 0 4px rgba(15, 23, 42, 0.16), inset -1px 0 0 rgba(255, 255, 255, 0.42), inset 0 -2px 1px rgba(255, 255, 255, 0.72)";

export function PlannerPageShell() {
  const searchParams = useSearchParams();
  const { applySearchParams } = useClientSearchParamsUpdater();
  const surfaceParam = searchParams.get("surface");
  const surface: PlannerSurface =
    surfaceParam === "calendar"
      ? "calendar"
      : surfaceParam === "checklist"
      ? "checklist"
      : surfaceParam === "tasks"
        ? "tasks"
        : "checklist";

  return (
    <Tabs
      value={surface}
      onValueChange={(value) => {
        const nextSurface: PlannerSurface =
          value === "calendar"
            ? "calendar"
            : value === "checklist"
            ? "checklist"
            : value === "tasks"
              ? "tasks"
              : "checklist";
        applySearchParams((params) => {
          params.delete("tab");
          if (nextSurface === "checklist") {
            params.delete("surface");
          } else if (nextSurface === "calendar") {
            params.set("surface", "calendar");
          } else {
            params.set("surface", "tasks");
          }
        }, "push");
      }}
      className="flex flex-col gap-4"
    >
      <TabsList
        variant="line"
        className="grid w-full grid-cols-3 gap-1.5 rounded-2xl bg-transparent p-0"
      >
        <TabsTrigger
          value="calendar"
          className={cn(
            plannerSurfaceTriggerBaseClass,
            plannerSurfaceTriggerToneClass
          )}
          style={
            surface === "calendar" ? { boxShadow: selectedChipShadow } : undefined
          }
        >
          <CalendarDays className="size-3.5" />
          <span className="truncate">Calendar</span>
        </TabsTrigger>
        <TabsTrigger
          value="checklist"
          className={cn(
            plannerSurfaceTriggerBaseClass,
            plannerSurfaceTriggerToneClass
          )}
          style={
            surface === "checklist"
              ? { boxShadow: selectedChipShadow }
              : undefined
          }
        >
          <ListChecks className="size-3.5" />
          <span className="truncate">Checklist</span>
        </TabsTrigger>
        <TabsTrigger
          value="tasks"
          className={cn(
            plannerSurfaceTriggerBaseClass,
            plannerSurfaceTriggerToneClass
          )}
          style={
            surface === "tasks" ? { boxShadow: selectedChipShadow } : undefined
          }
        >
          <NotebookPen className="size-3.5" />
          <span className="truncate">Tasks</span>
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
