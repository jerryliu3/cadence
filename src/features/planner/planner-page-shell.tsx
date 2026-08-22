"use client";

import { CalendarDays, ListChecks, NotebookPen } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { CalendarPageShell } from "@/features/planner/calendar-page-shell";
import { ChecklistShell } from "@/features/today/checklist-shell";
import { TasksTab } from "@/features/tasks/tasks-tab";
import { TabOnboardingOverlay } from "@/features/onboarding/tab-onboarding-overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientSearchParamsUpdater } from "@/lib/navigation/use-client-search-params-updater";
import { cn } from "@/lib/utils";

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
  const requestedOnboardingKey = searchParams.get("onboarding");
  const surfaceParam = searchParams.get("surface");
  const surface: PlannerSurface =
    surfaceParam === "calendar"
      ? "calendar"
      : surfaceParam === "checklist"
      ? "checklist"
      : surfaceParam === "tasks"
        ? "tasks"
        : "checklist";
  const onboardingKey = `planner.${surface}` as const;
  const onboardingTitle =
    surface === "calendar"
      ? "Calendar guide"
      : surface === "tasks"
      ? "Tasks guide"
      : "Checklist guide";
  const onboardingDescription =
    surface === "calendar"
      ? "Use Calendar to place sessions and lock must-do days before the week starts."
      : surface === "tasks"
      ? "Use Tasks for one-off work that should not become long-lived goals."
      : "Use Checklist to focus today's execution while your longer plan stays in Calendar.";

  return (
    <>
      <TabOnboardingOverlay
        onboardingKey={onboardingKey}
        title={onboardingTitle}
        description={onboardingDescription}
        forceOpen={requestedOnboardingKey === onboardingKey}
      />
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
            params.delete("onboarding");
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
    </>
  );
}
