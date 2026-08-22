"use client";

import { useState } from "react";
import { Check, NotebookPen, Plus } from "lucide-react";

type PlannerSurface = "calendar" | "checklist" | "tasks";

function SurfaceTab({
  value,
  selected,
  onSelect,
}: {
  value: PlannerSurface;
  selected: PlannerSurface;
  onSelect: (value: PlannerSurface) => void;
}) {
  const label =
    value === "calendar" ? "Calendar" : value === "checklist" ? "Checklist" : "Tasks";
  const isSelected = selected === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={() => onSelect(value)}
      className={`rounded-md px-2 py-1 ${
        isSelected
          ? "bg-background font-semibold text-foreground shadow-sm"
          : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function CalendarOutline() {
  const days = [
    { day: "Mon", date: "12", items: ["Deep work"], today: false },
    { day: "Tue", date: "13", items: [], today: false },
    { day: "Wed", date: "14", items: ["Launch"], today: false },
    { day: "Thu", date: "15", items: ["Tempo run"], today: true },
    { day: "Fri", date: "16", items: ["Update"], today: false },
    { day: "Sat", date: "17", items: [], today: false },
    { day: "Sun", date: "18", items: ["Review"], today: false },
  ] as const;

  return (
    <div data-testid="planner-surface-calendar" className="space-y-3 p-4">
      <p className="text-[10px] text-muted-foreground">
        A compact week grid. Timing and movement live here.
      </p>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <div
            key={day.day}
            className={`min-h-16 rounded-md border p-1 ${
              day.today ? "border-blue-300 bg-blue-50/80" : "bg-muted/20"
            }`}
          >
            <p
              className={`text-[8px] font-semibold ${
                day.today ? "text-blue-700" : "text-muted-foreground"
              }`}
            >
              {day.day}
            </p>
            <p className="mb-1 text-[8px]">{day.date}</p>
            <div className="space-y-0.5">
              {day.items.map((item) => (
                <p
                  key={item}
                  className="truncate rounded-sm border bg-background px-1 py-0.5 text-[8px]"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistOutline() {
  return (
    <div data-testid="planner-surface-checklist" className="space-y-3 p-4">
      <div>
        <p className="mb-1.5 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
          Daily
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5">
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-emerald-600 text-white">
              <Check className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium line-through opacity-70">
                Deep work
              </p>
              <p className="text-[9px] text-muted-foreground">
                Career · Daily recurring
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-medium text-emerald-800">
              Done
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-2.5">
            <span className="size-5 rounded-md border border-slate-300 bg-white" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium">Read 10 pages</p>
              <p className="text-[9px] text-muted-foreground">
                Personal · Daily recurring
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2">
          <p className="text-[8px] font-semibold text-muted-foreground uppercase">
            Weekly
          </p>
          <p className="mt-1 text-[10px] font-medium">Long run</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-[8px] font-semibold text-muted-foreground uppercase">
            Monthly
          </p>
          <p className="mt-1 text-[10px] font-medium">Budget review</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-[8px] font-semibold text-muted-foreground uppercase">
            Milestones
          </p>
          <p className="mt-1 text-[10px] font-medium">Launch · 2/4</p>
        </div>
      </div>
    </div>
  );
}

function TasksOutline() {
  const tasks = [
    { title: "Buy race nutrition", done: true },
    { title: "Email coach the weekly log", done: false },
    { title: "Book Saturday track lane", done: false },
  ] as const;

  return (
    <div data-testid="planner-surface-tasks" className="space-y-3 p-4">
      <p className="text-[10px] text-muted-foreground">
        One-time tasks stay separate from recurring goals.
      </p>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <div
            key={task.title}
            className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2"
          >
            <span
              className={`inline-flex size-5 items-center justify-center rounded-full border ${
                task.done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-300 text-transparent"
              }`}
            >
              <Check className="size-3" />
            </span>
            <p
              className={`min-w-0 flex-1 truncate text-[11px] font-medium ${
                task.done ? "text-muted-foreground" : ""
              }`}
            >
              {task.title}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-[10px] text-muted-foreground">
        <Plus className="size-3.5" />
        Add a task for Thursday
      </div>
    </div>
  );
}

export function LandingPlannerSurfaceTour() {
  const [surface, setSurface] = useState<PlannerSurface>("checklist");

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_18px_55px_-35px_rgba(37,99,235,0.5)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-xs font-semibold">Thursday, Aug 15</p>
          <p className="text-[10px] text-muted-foreground">
            {surface === "calendar"
              ? "This week's plan"
              : surface === "tasks"
                ? "Today's tasks"
                : "Today's goals"}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Planner surface"
          className="flex rounded-lg bg-muted p-1 text-[9px]"
        >
          <SurfaceTab value="calendar" selected={surface} onSelect={setSurface} />
          <SurfaceTab value="checklist" selected={surface} onSelect={setSurface} />
          <SurfaceTab value="tasks" selected={surface} onSelect={setSurface} />
        </div>
      </div>
      <div className="grid" data-testid="planner-surface-stage">
        <div
          className="col-start-1 row-start-1"
          style={{ visibility: surface === "calendar" ? "visible" : "hidden" }}
          aria-hidden={surface !== "calendar"}
        >
          <CalendarOutline />
        </div>
        <div
          className="col-start-1 row-start-1"
          style={{ visibility: surface === "checklist" ? "visible" : "hidden" }}
          aria-hidden={surface !== "checklist"}
        >
          <ChecklistOutline />
        </div>
        <div
          className="col-start-1 row-start-1"
          style={{ visibility: surface === "tasks" ? "visible" : "hidden" }}
          aria-hidden={surface !== "tasks"}
        >
          <TasksOutline />
        </div>
      </div>
      <div className="flex min-h-10 items-center justify-between border-t bg-muted/25 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium">
            {surface === "calendar"
              ? "Drag sessions across days"
              : surface === "tasks"
                ? "Keep errands out of the goal list"
                : "Tasks for this day"}
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground">
          {surface === "tasks" ? "3 one-time tasks" : "2 one-time tasks"}
        </span>
      </div>
    </div>
  );
}
