"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PlannerDemoPhase =
  | "month"
  | "month-lifting-past"
  | "month-moving-past"
  | "month-settling-past"
  | "month-lifting-future"
  | "month-moving-future"
  | "month-settling-future"
  | "clicking-save"
  | "saving"
  | "saved"
  | "opening-week-menu"
  | "selecting-week"
  | "week"
  | "week-tapping"
  | "week-preview"
  | "week-completing"
  | "week-completed"
  | "opening-month-menu"
  | "selecting-month";

type TaskTone = "blue" | "emerald" | "violet" | "amber";
type MonthMoveKey = "past" | "future";
type MonthEntryVariant = "default" | "ghost" | "new";
type MonthEntryRole =
  | "past-source"
  | "past-dest"
  | "future-source"
  | "future-dest";

type SeededTask = {
  id: string;
  label: string;
  tone: TaskTone;
};

export type MonthDemoEntry = SeededTask & {
  variant: MonthEntryVariant;
  hidden?: boolean;
  role?: MonthEntryRole;
};

type FlightGeometry = {
  moveKey: MonthMoveKey;
  left: number;
  top: number;
  width: number;
  height: number;
  deltaX: number;
  deltaY: number;
};

export const plannerDemoViewOptions = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "three-day", label: "3 Day" },
  { value: "day", label: "Day" },
] as const;

const phaseOrder: PlannerDemoPhase[] = [
  "month",
  "month-lifting-past",
  "month-moving-past",
  "month-settling-past",
  "month-lifting-future",
  "month-moving-future",
  "month-settling-future",
  "clicking-save",
  "saving",
  "saved",
  "opening-week-menu",
  "selecting-week",
  "week",
  "week-tapping",
  "week-preview",
  "week-completing",
  "week-completed",
  "opening-month-menu",
  "selecting-month",
];

export const phaseDurationMs: Record<PlannerDemoPhase, number> = {
  month: 1100,
  "month-lifting-past": 280,
  "month-moving-past": 720,
  "month-settling-past": 280,
  "month-lifting-future": 280,
  "month-moving-future": 720,
  "month-settling-future": 280,
  "clicking-save": 500,
  saving: 650,
  saved: 2000,
  "opening-week-menu": 400,
  "selecting-week": 400,
  week: 1200,
  "week-tapping": 450,
  "week-preview": 900,
  "week-completing": 550,
  "week-completed": 2000,
  "opening-month-menu": 400,
  "selecting-month": 400,
};

export const SEEDED_TODAY = 15;

export const monthEntries = [
  { id: "focus", day: 4, label: "Deep work", tone: "blue" },
  { id: "tempo", day: 8, label: "Tempo run", tone: "emerald" },
  { id: "plan", day: 12, label: "Plan review", tone: "violet" },
  { id: "launch", day: SEEDED_TODAY, label: "Launch notes", tone: "amber" },
  { id: "strength", day: 18, label: "Strength", tone: "emerald" },
  { id: "review", day: 24, label: "Weekly reset", tone: "blue" },
] as const satisfies ReadonlyArray<{
  id: string;
  day: number;
  label: string;
  tone: TaskTone;
}>;

const seededDays: ReadonlyArray<{
  id: string;
  day: string;
  date: string;
  isToday?: boolean;
  tasks: readonly SeededTask[];
}> = [
  {
    id: "mon",
    day: "Mon",
    date: "12",
    tasks: [
      { id: "focus", label: "Focus", tone: "blue" },
      { id: "goal-review", label: "Goal review", tone: "violet" },
    ],
  },
  {
    id: "tue",
    day: "Tue",
    date: "13",
    tasks: [{ id: "roadmap", label: "Roadmap", tone: "amber" }],
  },
  {
    id: "wed",
    day: "Wed",
    date: "14",
    tasks: [{ id: "launch-copy", label: "Launch copy", tone: "violet" }],
  },
  {
    id: "thu",
    day: "Thu",
    date: String(SEEDED_TODAY),
    isToday: true,
    tasks: [{ id: "tempo-run", label: "Tempo run", tone: "emerald" }],
  },
  {
    id: "fri",
    day: "Fri",
    date: "16",
    tasks: [{ id: "update", label: "Update", tone: "amber" }],
  },
  { id: "sat", day: "Sat", date: "17", tasks: [] },
  {
    id: "sun",
    day: "Sun",
    date: "18",
    tasks: [{ id: "weekly-review", label: "Weekly review", tone: "blue" }],
  },
];

const monthDates = Array.from({ length: 35 }, (_, index) =>
  index < 2 || index > 32 ? null : index - 1
);

const tempoTask: SeededTask = {
  id: "tempo",
  label: "Tempo run",
  tone: "emerald",
};

const strengthTask: SeededTask = {
  id: "strength",
  label: "Strength",
  tone: "emerald",
};

export function nextPlannerDemoPhase(
  phase: PlannerDemoPhase,
  reducedMotion: boolean
): PlannerDemoPhase {
  if (reducedMotion) {
    return "month";
  }

  return phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length];
}

export function isBusyPlannerDemoPhase(phase: PlannerDemoPhase) {
  return (
    phase === "week-tapping" ||
    phase === "week-completing" ||
    phase.includes("opening-") ||
    phase.includes("selecting-") ||
    isTravelPhase(phase) ||
    phase === "clicking-save" ||
    phase === "saving"
  );
}

function getStatusNote(phase: PlannerDemoPhase) {
  switch (phase) {
    case "week-tapping":
      return "Opening today";
    case "week-preview":
      return "Reviewing today";
    case "week-completing":
      return "Marking Tempo run done";
    case "week-completed":
      return "Progress updated";
    case "opening-month-menu":
    case "selecting-month":
      return "Switching to Month";
    case "month":
      return "August overview";
    case "month-lifting-past":
    case "month-moving-past":
    case "month-settling-past":
      return "Moving missed Tempo run forward";
    case "month-lifting-future":
    case "month-moving-future":
    case "month-settling-future":
      return "Bringing Strength into today";
    case "clicking-save":
      return "Saving plan";
    case "saving":
      return "Saving 2 plan updates...";
    case "saved":
      return "Plan saved";
    case "opening-week-menu":
    case "selecting-week":
      return "Returning to Week";
    default:
      return "Reviewing this week";
  }
}

function toneClassName(tone: TaskTone) {
  if (tone === "emerald") {
    return "border-emerald-300/80 bg-emerald-100/85 text-emerald-950";
  }
  if (tone === "violet") {
    return "border-violet-300/80 bg-violet-100/85 text-violet-950";
  }
  if (tone === "amber") {
    return "border-amber-300/80 bg-amber-100/90 text-amber-950";
  }
  return "border-blue-300/80 bg-blue-100/85 text-blue-950";
}

function getActiveMonthMove(phase: PlannerDemoPhase): MonthMoveKey | null {
  if (phase.endsWith("-past")) {
    return "past";
  }
  if (phase.endsWith("-future")) {
    return "future";
  }
  return null;
}

function isTravelPhase(phase: PlannerDemoPhase) {
  return (
    phase.includes("-lifting-") ||
    phase.includes("-moving-") ||
    phase.includes("-settling-")
  );
}

export function getMonthDemoEntries(
  date: number,
  phase: PlannerDemoPhase
): MonthDemoEntry[] {
  const phaseIndex = phaseOrder.indexOf(phase);
  const pastMoved = phaseIndex > phaseOrder.indexOf("month-settling-past");
  const futureMoved = phaseIndex > phaseOrder.indexOf("month-settling-future");
  const planSaved = phaseIndex >= phaseOrder.indexOf("saved");
  const travelingPast = getActiveMonthMove(phase) === "past" && isTravelPhase(phase);
  const travelingFuture =
    getActiveMonthMove(phase) === "future" && isTravelPhase(phase);
  const entries: MonthDemoEntry[] = [];

  for (const entry of monthEntries) {
    if (entry.day !== date) {
      continue;
    }

    if (entry.id === "tempo") {
      if (travelingPast) {
        entries.push({
          ...entry,
          variant: "default",
          hidden: true,
          role: "past-source",
        });
        continue;
      }
      if (pastMoved && planSaved) {
        continue;
      }
      if (pastMoved) {
        entries.push({ ...entry, variant: "ghost", role: "past-source" });
        continue;
      }
    }

    if (entry.id === "strength") {
      if (travelingFuture) {
        entries.push({
          ...entry,
          variant: "default",
          hidden: true,
          role: "future-source",
        });
        continue;
      }
      if (futureMoved && planSaved) {
        continue;
      }
      if (futureMoved) {
        entries.push({ ...entry, variant: "ghost", role: "future-source" });
        continue;
      }
    }

    entries.push({ ...entry, variant: "default" });
  }

  if (date === 24 && pastMoved) {
    entries.push({
      ...tempoTask,
      variant: planSaved ? "default" : "new",
      role: "past-dest",
    });
  }

  if (date === SEEDED_TODAY && futureMoved) {
    entries.push({
      ...strengthTask,
      variant: planSaved ? "default" : "new",
      role: "future-dest",
    });
  }

  return entries;
}

const taskChipLayoutClassName =
  "flex min-h-7 items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] leading-[1.2] font-medium shadow-[0_1px_1px_rgba(15,23,42,0.06)]";

function TaskTile({
  task,
  completed = false,
}: {
  task: SeededTask;
  completed?: boolean;
}) {
  return (
    <p
      className={`${taskChipLayoutClassName} whitespace-normal ${toneClassName(
        task.tone
      )}`}
    >
      {completed ? <Check className="size-2.5 shrink-0 text-emerald-700" /> : null}
      <span>{task.label}</span>
    </p>
  );
}

function MonthPill({
  task,
  variant = "default",
}: {
  task: SeededTask;
  variant?: MonthEntryVariant;
}) {
  return (
    <div
      data-month-entry={task.id}
      data-month-entry-variant={variant}
      title={task.label}
      className={`${taskChipLayoutClassName} overflow-hidden ${
        variant === "ghost"
          ? "border-dashed border-slate-300 bg-slate-50 text-slate-500 line-through shadow-none"
          : variant === "new"
            ? "border-blue-300 bg-blue-50 text-blue-950"
            : toneClassName(task.tone)
      }`}
    >
      <span className="min-w-0 truncate">{task.label}</span>
    </div>
  );
}

export function LandingPlannerPreview() {
  const reducedMotion = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<PlannerDemoPhase>("month");
  const [isVisible, setIsVisible] = useState(false);
  const [flight, setFlight] = useState<FlightGeometry | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const monthCalendarRef = useRef<HTMLDivElement | null>(null);
  const pastSourceRef = useRef<HTMLDivElement | null>(null);
  const pastDestinationRef = useRef<HTMLDivElement | null>(null);
  const futureSourceRef = useRef<HTMLDivElement | null>(null);
  const futureDestinationRef = useRef<HTMLDivElement | null>(null);

  const displayPhase = reducedMotion ? "month" : phase;
  const phaseIndex = phaseOrder.indexOf(displayPhase);
  const activeMove = getActiveMonthMove(displayPhase);
  const travelPhase = isTravelPhase(displayPhase);
  const showWeekRipple = displayPhase === "week-tapping";
  const showWeekPreview =
    phaseIndex >= phaseOrder.indexOf("week-preview") &&
    phaseIndex <= phaseOrder.indexOf("selecting-month");
  const weekSessionCompleted =
    phaseIndex >= phaseOrder.indexOf("week-completing") &&
    phaseIndex <= phaseOrder.indexOf("selecting-month");
  const isWeekView =
    displayPhase.startsWith("week") ||
    displayPhase === "opening-month-menu" ||
    displayPhase === "selecting-month";
  const isMonthView = !isWeekView;
  const isViewMenuOpen =
    displayPhase === "opening-month-menu" ||
    displayPhase === "selecting-month" ||
    displayPhase === "opening-week-menu" ||
    displayPhase === "selecting-week";
  const isSelectingMonth = displayPhase === "selecting-month";
  const isSelectingWeek = displayPhase === "selecting-week";
  const isBusy = isBusyPlannerDemoPhase(displayPhase);
  const isSuccess = displayPhase === "week-completed" || displayPhase === "saved";
  const pastMoved = phaseIndex > phaseOrder.indexOf("month-settling-past");
  const planSaved = phaseIndex >= phaseOrder.indexOf("saved");
  const showSavePlan = pastMoved && !planSaved;

  const measureFlight = useCallback(() => {
    const calendar = monthCalendarRef.current;
    const source =
      activeMove === "past" ? pastSourceRef.current : futureSourceRef.current;
    const destination =
      activeMove === "past"
        ? pastDestinationRef.current
        : futureDestinationRef.current;
    if (!calendar || !source || !destination || !activeMove) {
      return;
    }

    const calendarRect = calendar.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    setFlight({
      moveKey: activeMove,
      left: sourceRect.left - calendarRect.left,
      top: sourceRect.top - calendarRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
      deltaX: destinationRect.left - sourceRect.left,
      deltaY: destinationRect.top - sourceRect.top,
    });
  }, [activeMove]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 }
    );
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || reducedMotion) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPhase((current) => nextPlannerDemoPhase(current, false));
    }, phaseDurationMs[phase]);

    return () => window.clearTimeout(timeoutId);
  }, [isVisible, phase, reducedMotion]);

  useLayoutEffect(() => {
    if (!travelPhase || !activeMove) {
      return;
    }
    measureFlight();
  }, [activeMove, measureFlight, travelPhase]);

  useEffect(() => {
    if (!travelPhase) {
      return;
    }
    window.addEventListener("resize", measureFlight);
    return () => window.removeEventListener("resize", measureFlight);
  }, [measureFlight, travelPhase]);

  const currentView = isMonthView ? "Month" : "Week";
  const statusNote = getStatusNote(displayPhase);

  const flightPosition = displayPhase.includes("-lifting-")
    ? { x: 0, y: -24, scale: 1.06 }
    : displayPhase.includes("-moving-")
      ? {
          x: flight?.deltaX ?? 0,
          y: (flight?.deltaY ?? 0) - 24,
          scale: 1.06,
        }
      : {
          x: flight?.deltaX ?? 0,
          y: flight?.deltaY ?? 0,
          scale: 1,
        };

  const entryRef = (role: MonthEntryRole | undefined) => {
    if (role === "past-source") {
      return pastSourceRef;
    }
    if (role === "past-dest") {
      return pastDestinationRef;
    }
    if (role === "future-source") {
      return futureSourceRef;
    }
    if (role === "future-dest") {
      return futureDestinationRef;
    }
    return undefined;
  };

  return (
    <Card ref={previewRef} className="overflow-hidden border shadow-sm">
      <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500" />
      <CardHeader className="relative z-30 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CardTitle className="shrink-0 text-base">Your plan</CardTitle>
            <div
              data-demo-status={isBusy ? "busy" : isSuccess ? "success" : "idle"}
              className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              {isBusy ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-blue-600" />
              ) : isSuccess ? (
                <Check className="size-3 shrink-0 text-emerald-600" />
              ) : (
                <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
              )}
              <p className="truncate text-foreground">{statusNote}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
            <div className="flex min-w-[5.75rem] justify-end">
              {showSavePlan ? (
                <div
                  data-demo-save-plan
                  className={`relative inline-flex h-8 items-center overflow-hidden rounded-md bg-blue-700 px-2.5 text-[11px] font-semibold text-white shadow-sm transition ${
                    displayPhase === "clicking-save"
                      ? "scale-95 bg-blue-800 ring-2 ring-blue-300 ring-offset-1"
                      : ""
                  }`}
                >
                  {displayPhase === "clicking-save" ? (
                    <motion.span
                      className="pointer-events-none absolute inset-0 bg-white/35"
                      initial={reducedMotion ? false : { opacity: 0.55 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.45 }}
                    />
                  ) : null}
                  {displayPhase === "saving" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-3 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save plan"
                  )}
                </div>
              ) : null}
            </div>
            <div className="relative">
              <div
                data-demo-view-selector={currentView.toLowerCase()}
                className="inline-flex h-8 min-w-24 items-center justify-between gap-2 rounded-lg border bg-card px-2.5 text-xs font-medium shadow-sm"
              >
                <span>{currentView}</span>
                <ChevronDown
                  className={`size-3.5 text-muted-foreground transition-transform ${
                    isViewMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
              {isViewMenuOpen ? (
                <motion.div
                  data-demo-view-menu
                  initial={reducedMotion ? false : { y: -4 }}
                  animate={{ y: 0 }}
                  className="absolute top-9 right-0 z-40 w-32 rounded-lg border bg-card p-1 text-xs shadow-lg"
                >
                  {plannerDemoViewOptions.map(({ value, label }) => {
                    const selected =
                      (value === "month" && isSelectingMonth) ||
                      (value === "week" && isSelectingWeek);
                    return (
                      <div
                        key={value}
                        data-demo-view-option={value}
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                          selected ? "bg-blue-100 font-medium text-blue-900" : ""
                        }`}
                      >
                        <span>{label}</span>
                        {selected ? <Check className="size-3" /> : null}
                      </div>
                    );
                  })}
                </motion.div>
              ) : null}
            </div>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {statusNote}. Showing {currentView} view.
        </p>
      </CardHeader>

      <CardContent className="h-[430px] sm:h-[448px]">
        <div
          data-demo-calendar-stage
          className="relative h-full min-h-0 overflow-hidden"
        >
          {isMonthView ? (
            <motion.div
              key="month"
              ref={monthCalendarRef}
              data-calendar-view="month"
              initial={reducedMotion ? false : { y: 6 }}
              animate={{ y: 0 }}
              className="relative flex h-full flex-col"
            >
              <div className="mb-1 grid grid-cols-7 gap-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <p
                    key={day}
                    className="text-center text-[8px] leading-none font-semibold text-muted-foreground sm:text-[9px]"
                  >
                    {day}
                  </p>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 gap-1">
                {monthDates.map((date, index) => {
                  const cellEntries = date
                    ? getMonthDemoEntries(date, displayPhase)
                    : [];
                  const isToday = date === SEEDED_TODAY;
                  const hasPastDest = cellEntries.some(
                    (entry) => entry.role === "past-dest"
                  );
                  const hasFutureDest = cellEntries.some(
                    (entry) => entry.role === "future-dest"
                  );
                  return (
                    <div
                      key={`${date ?? "empty"}-${index}`}
                      data-month-day-cell={date ?? undefined}
                      className={`flex min-h-0 flex-col overflow-hidden rounded-md border p-0.5 ${
                        date
                          ? isToday
                            ? "border-blue-300 bg-blue-50/80"
                            : "bg-muted/20"
                          : "border-transparent"
                      }`}
                    >
                      {date ? (
                        <>
                          <div className="flex h-3 shrink-0 items-center justify-between">
                            <span
                              aria-current={isToday ? "date" : undefined}
                              aria-label={
                                isToday ? `${date}, Today` : undefined
                              }
                              className={`inline-flex size-3 items-center justify-center rounded-full text-[8px] ${
                                isToday
                                  ? "bg-blue-600 font-semibold text-white"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {date}
                            </span>
                            {isToday ? (
                              <span className="hidden text-[7px] font-semibold text-blue-700 sm:inline">
                                Today
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 min-h-0 flex-1 space-y-0.5">
                            {cellEntries.map((entry) => (
                              <div
                                key={`${entry.role ?? "base"}-${entry.id}`}
                                ref={entryRef(entry.role)}
                                className={entry.hidden ? "invisible" : ""}
                              >
                                <MonthPill
                                  task={entry}
                                  variant={entry.variant}
                                />
                              </div>
                            ))}
                            {date === 24 && !hasPastDest ? (
                              <div
                                ref={pastDestinationRef}
                                className="min-h-7"
                              />
                            ) : null}
                            {date === SEEDED_TODAY && !hasFutureDest ? (
                              <div
                                ref={futureDestinationRef}
                                className="min-h-7"
                              />
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {travelPhase &&
              activeMove &&
              flight?.moveKey === activeMove ? (
                <motion.div
                  data-moving-task={activeMove}
                  className={`pointer-events-none absolute z-20 ${taskChipLayoutClassName} shadow-[0_10px_24px_rgba(37,99,235,0.25)] ${toneClassName(
                    activeMove === "past" ? tempoTask.tone : strengthTask.tone
                  )}`}
                  initial={{ x: 0, y: 0, scale: 1 }}
                  animate={flightPosition}
                  transition={{
                    duration: displayPhase.includes("-moving-") ? 0.72 : 0.28,
                    ease: "easeInOut",
                  }}
                  style={{
                    left: flight.left,
                    top: flight.top,
                    width: flight.width,
                    minHeight: flight.height,
                  }}
                >
                  <span className="truncate">
                    {activeMove === "past"
                      ? tempoTask.label
                      : strengthTask.label}
                  </span>
                </motion.div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="week"
              data-calendar-view="week"
              initial={false}
              animate={{ y: 0 }}
              className="h-full"
            >
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {seededDays.map((day) => (
                  <div
                    key={day.id}
                    className={`relative min-w-0 overflow-hidden rounded-lg border p-1.5 ${
                      day.isToday
                        ? "border-blue-300 bg-blue-50/80"
                        : "bg-muted/20"
                    }`}
                  >
                    {day.isToday && showWeekRipple ? (
                      <motion.span
                        data-demo-day-ripple
                        className="pointer-events-none absolute top-1/2 left-1/2 size-8 rounded-full bg-blue-500/35"
                        initial={
                          reducedMotion
                            ? false
                            : { opacity: 0.65, scale: 0.35, x: "-50%", y: "-50%" }
                        }
                        animate={{ opacity: 0, scale: 2.4, x: "-50%", y: "-50%" }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                      />
                    ) : null}
                    <p
                      className={`text-[9px] font-semibold sm:text-[10px] ${
                        day.isToday ? "text-blue-700" : "text-muted-foreground"
                      }`}
                    >
                      {day.day}
                    </p>
                    <div className="mb-1 flex min-h-4 items-center">
                      <span
                        className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] ${
                          day.isToday
                            ? "bg-blue-600 font-semibold text-white"
                            : "text-muted-foreground"
                        }`}
                      >
                        {day.date}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {day.tasks.map((task) => (
                        <TaskTile
                          key={task.id}
                          task={task}
                          completed={
                            task.id === "tempo-run" && weekSessionCompleted
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {showWeekPreview ? (
                <motion.div
                  data-demo-day-preview
                  initial={reducedMotion ? false : { y: 6 }}
                  animate={{ y: 0 }}
                  className="mt-3 ml-auto max-w-sm rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold text-blue-950">
                      Thursday, August 15
                    </p>
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[8px] font-semibold text-white">
                      Today
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white p-2">
                    <span
                      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition ${
                        weekSessionCompleted
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-300 text-transparent"
                      }`}
                    >
                      <Check className="size-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-medium">
                        Tempo run
                      </p>
                      <p className="text-[8px] text-muted-foreground">
                        Weekly recurring · Health
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </motion.div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
