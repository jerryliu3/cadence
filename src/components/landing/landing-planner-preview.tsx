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
  | "week"
  | "week-preview"
  | "week-completing"
  | "week-completed"
  | "opening-month-menu"
  | "selecting-month"
  | "month"
  | "month-lifting-past"
  | "month-moving-past"
  | "month-settling-past"
  | "month-lifting-future"
  | "month-moving-future"
  | "month-settling-future"
  | "saving"
  | "saved"
  | "opening-week-menu"
  | "selecting-week";

type TaskTone = "blue" | "emerald" | "violet" | "amber";
type MonthMoveKey = "past" | "future";

type SeededTask = {
  id: string;
  label: string;
  tone: TaskTone;
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

const phaseOrder: PlannerDemoPhase[] = [
  "week",
  "week-preview",
  "week-completing",
  "week-completed",
  "opening-month-menu",
  "selecting-month",
  "month",
  "month-lifting-past",
  "month-moving-past",
  "month-settling-past",
  "month-lifting-future",
  "month-moving-future",
  "month-settling-future",
  "saving",
  "saved",
  "opening-week-menu",
  "selecting-week",
];

const phaseDurationMs: Record<PlannerDemoPhase, number> = {
  week: 1200,
  "week-preview": 900,
  "week-completing": 550,
  "week-completed": 950,
  "opening-month-menu": 400,
  "selecting-month": 400,
  month: 1100,
  "month-lifting-past": 280,
  "month-moving-past": 720,
  "month-settling-past": 280,
  "month-lifting-future": 280,
  "month-moving-future": 720,
  "month-settling-future": 280,
  saving: 650,
  saved: 950,
  "opening-week-menu": 400,
  "selecting-week": 400,
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
    return "week-completed";
  }

  return phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length];
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

function toneDotClassName(tone: TaskTone) {
  if (tone === "emerald") {
    return "bg-emerald-500";
  }
  if (tone === "violet") {
    return "bg-violet-500";
  }
  if (tone === "amber") {
    return "bg-amber-500";
  }
  return "bg-blue-500";
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

function TaskTile({
  task,
  completed = false,
}: {
  task: SeededTask;
  completed?: boolean;
}) {
  return (
    <p
      className={`min-h-7 whitespace-normal rounded-md border px-1.5 py-1 text-[9px] leading-[1.2] ${toneClassName(
        task.tone
      )} ${completed ? "line-through opacity-65" : ""}`}
    >
      {task.label}
    </p>
  );
}

function MonthPill({
  task,
  variant = "default",
}: {
  task: SeededTask;
  variant?: "default" | "ghost" | "new";
}) {
  return (
    <div
      className={`flex min-h-4 items-center gap-1 rounded-sm border px-1 py-0.5 text-[7px] font-medium sm:text-[8px] ${
        variant === "ghost"
          ? "border-dashed border-slate-300 bg-slate-50 text-slate-500 line-through"
          : variant === "new"
            ? "border-blue-300 bg-blue-50 text-blue-950"
            : "border-border/70 bg-background/90 text-foreground"
      }`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${toneDotClassName(task.tone)}`}
      />
      <span className="truncate">{task.label}</span>
    </div>
  );
}

export function LandingPlannerPreview() {
  const reducedMotion = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<PlannerDemoPhase>("week");
  const [isVisible, setIsVisible] = useState(false);
  const [flight, setFlight] = useState<FlightGeometry | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const monthCalendarRef = useRef<HTMLDivElement | null>(null);
  const pastSourceRef = useRef<HTMLDivElement | null>(null);
  const pastDestinationRef = useRef<HTMLDivElement | null>(null);
  const futureSourceRef = useRef<HTMLDivElement | null>(null);
  const futureDestinationRef = useRef<HTMLDivElement | null>(null);

  const displayPhase = reducedMotion ? "week-completed" : phase;
  const phaseIndex = phaseOrder.indexOf(displayPhase);
  const activeMove = getActiveMonthMove(displayPhase);
  const travelPhase = isTravelPhase(displayPhase);
  const pastMoved = phaseIndex > phaseOrder.indexOf("month-settling-past");
  const futureMoved = phaseIndex > phaseOrder.indexOf("month-settling-future");
  const showWeekPreview =
    phaseIndex >= phaseOrder.indexOf("week-preview") &&
    phaseIndex <= phaseOrder.indexOf("selecting-month");
  const weekSessionCompleted =
    phaseIndex >= phaseOrder.indexOf("week-completing") &&
    phaseIndex <= phaseOrder.indexOf("selecting-month");
  const isMonthView =
    phaseIndex >= phaseOrder.indexOf("month") &&
    phaseIndex <= phaseOrder.indexOf("selecting-week");
  const isViewMenuOpen =
    displayPhase === "opening-month-menu" ||
    displayPhase === "selecting-month" ||
    displayPhase === "opening-week-menu" ||
    displayPhase === "selecting-week";
  const isSelectingMonth = displayPhase === "selecting-month";
  const isSelectingWeek = displayPhase === "selecting-week";

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
  const statusNote =
    displayPhase === "week-preview"
      ? "Reviewing today"
      : displayPhase === "week-completing"
        ? "Marking Tempo run done"
        : displayPhase === "week-completed"
          ? "Progress updated"
          : displayPhase === "opening-month-menu" ||
              displayPhase === "selecting-month"
            ? "Switching to Month"
            : displayPhase === "month"
              ? "August overview"
              : displayPhase.endsWith("-past")
                ? "Moving missed Tempo run forward"
                : displayPhase.endsWith("-future")
                  ? "Bringing Strength into today"
                  : displayPhase === "saving"
                    ? "Saving 2 plan updates..."
                    : displayPhase === "saved"
                      ? "Plan saved"
                      : displayPhase === "opening-week-menu" ||
                          displayPhase === "selecting-week"
                        ? "Returning to Week"
                        : "Reviewing this week";

  const flightPosition =
    displayPhase.includes("-lifting-")
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

  return (
    <Card ref={previewRef} className="overflow-hidden border shadow-sm">
      <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500" />
      <CardHeader className="relative z-30 pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Your plan</CardTitle>
          <div className="relative" aria-hidden="true">
            <div
              data-demo-view-selector={currentView.toLowerCase()}
              className="inline-flex min-w-24 items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium shadow-sm"
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
                initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-9 right-0 z-40 w-28 rounded-lg border bg-card p-1 text-xs shadow-lg"
              >
                <div
                  data-demo-view-option="week"
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                    isSelectingWeek ? "bg-blue-100 font-medium text-blue-900" : ""
                  }`}
                >
                  <span>Week</span>
                  {isSelectingWeek ? <Check className="size-3" /> : null}
                </div>
                <div
                  data-demo-view-option="month"
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                    isSelectingMonth
                      ? "bg-blue-100 font-medium text-blue-900"
                      : ""
                  }`}
                >
                  <span>Month</span>
                  {isSelectingMonth ? <Check className="size-3" /> : null}
                </div>
              </motion.div>
            ) : null}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {statusNote}. Showing {currentView} view.
        </p>
      </CardHeader>

      <CardContent className="grid h-[380px] grid-rows-[minmax(0,1fr)_auto] gap-3 sm:h-[360px]">
        <div
          data-demo-calendar-stage
          className="relative min-h-0 overflow-hidden"
        >
          {isMonthView ? (
            <motion.div
              key="month"
              ref={monthCalendarRef}
              data-calendar-view="month"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative h-full"
            >
              <div className="mb-1 grid grid-cols-7 gap-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <p
                    key={day}
                    className="text-center text-[8px] font-semibold text-muted-foreground sm:text-[9px]"
                  >
                    {day}
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDates.map((date, index) => {
                  const baseEntries = date
                    ? monthEntries.filter((entry) => entry.day === date)
                    : [];
                  const isToday = date === SEEDED_TODAY;
                  return (
                    <div
                      key={`${date ?? "empty"}-${index}`}
                      className={`h-12 min-w-0 rounded-md border p-1 sm:h-[3.35rem] ${
                        date
                          ? isToday
                            ? "border-blue-300 bg-blue-50/80"
                            : "bg-muted/20"
                          : "border-transparent"
                      }`}
                    >
                      {date ? (
                        <>
                          <div className="flex h-3.5 items-center justify-between">
                            <span
                              className={`inline-flex size-3.5 items-center justify-center rounded-full text-[8px] ${
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
                          <div className="mt-0.5 space-y-0.5">
                            {baseEntries.map((entry) => {
                              const task: SeededTask = entry;
                              if (entry.id === "tempo") {
                                return (
                                  <div
                                    key={entry.id}
                                    ref={pastSourceRef}
                                    className={
                                      activeMove === "past" && travelPhase
                                        ? "invisible"
                                        : ""
                                    }
                                  >
                                    <MonthPill
                                      task={task}
                                      variant={pastMoved ? "ghost" : "default"}
                                    />
                                  </div>
                                );
                              }
                              if (entry.id === "strength") {
                                return (
                                  <div
                                    key={entry.id}
                                    ref={futureSourceRef}
                                    className={
                                      activeMove === "future" && travelPhase
                                        ? "invisible"
                                        : ""
                                    }
                                  >
                                    <MonthPill
                                      task={task}
                                      variant={futureMoved ? "ghost" : "default"}
                                    />
                                  </div>
                                );
                              }
                              return <MonthPill key={entry.id} task={task} />;
                            })}

                            {date === 24 ? (
                              <div
                                ref={pastDestinationRef}
                                className="min-h-4"
                              >
                                {pastMoved ? (
                                  <MonthPill task={tempoTask} variant="new" />
                                ) : null}
                              </div>
                            ) : null}
                            {date === SEEDED_TODAY ? (
                              <div
                                ref={futureDestinationRef}
                                className="min-h-4"
                              >
                                {futureMoved ? (
                                  <MonthPill task={strengthTask} variant="new" />
                                ) : null}
                              </div>
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
                  className={`pointer-events-none absolute z-20 flex min-h-4 items-center gap-1 rounded-sm border px-1 py-0.5 text-[8px] font-medium shadow-[0_10px_24px_rgba(37,99,235,0.25)] ${toneClassName(
                    activeMove === "past" ? tempoTask.tone : strengthTask.tone
                  )}`}
                  initial={{ x: 0, y: 0, scale: 1 }}
                  animate={flightPosition}
                  transition={{
                    duration: displayPhase.includes("-moving-")
                      ? 0.72
                      : 0.28,
                    ease: "easeInOut",
                  }}
                  style={{
                    left: flight.left,
                    top: flight.top,
                    width: flight.width,
                    minHeight: flight.height,
                  }}
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${toneDotClassName(
                      activeMove === "past" ? tempoTask.tone : strengthTask.tone
                    )}`}
                  />
                  <span className="truncate">
                    {activeMove === "past" ? tempoTask.label : strengthTask.label}
                  </span>
                </motion.div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="week"
              data-calendar-view="week"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full"
            >
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {seededDays.map((day) => (
                  <div
                    key={day.id}
                    className={`min-w-0 rounded-lg border p-1.5 ${
                      day.isToday
                        ? "border-blue-300 bg-blue-50/80"
                        : "bg-muted/20"
                    }`}
                  >
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
                          completed={task.id === "tempo-run" && weekSessionCompleted}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {showWeekPreview ? (
                <motion.div
                  data-demo-day-preview
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 ml-auto max-w-sm rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-blue-950">
                        Thursday, August 15
                      </p>
                      <p className="text-[9px] text-blue-800">Today&apos;s plan</p>
                    </div>
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
                      <p
                        className={`truncate text-[10px] font-medium ${
                          weekSessionCompleted ? "line-through opacity-65" : ""
                        }`}
                      >
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

        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
          {displayPhase === "saving" ? (
            <Loader2 className="size-3 animate-spin text-blue-600" />
          ) : displayPhase === "saved" ||
            displayPhase === "week-completed" ? (
            <Check className="size-3 text-emerald-600" />
          ) : (
            <span className="size-1.5 rounded-full bg-blue-500" />
          )}
          <p className="text-xs font-medium">{statusNote}</p>
        </div>
      </CardContent>
    </Card>
  );
}
