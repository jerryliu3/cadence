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
  | "editing"
  | "lifting"
  | "moving"
  | "settling"
  | "saving"
  | "saved"
  | "opening-month-menu"
  | "selecting-month"
  | "month"
  | "opening-week-menu"
  | "selecting-week";

type TaskTone = "blue" | "emerald" | "violet" | "amber";

type SeededTask = {
  id: string;
  label: string;
  tone: TaskTone;
};

type FlightGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  deltaX: number;
  deltaY: number;
};

const phaseOrder: PlannerDemoPhase[] = [
  "editing",
  "lifting",
  "moving",
  "settling",
  "saving",
  "saved",
  "opening-month-menu",
  "selecting-month",
  "month",
  "opening-week-menu",
  "selecting-week",
];

const phaseDurationMs: Record<PlannerDemoPhase, number> = {
  editing: 1500,
  lifting: 320,
  moving: 850,
  settling: 320,
  saving: 650,
  saved: 1100,
  "opening-month-menu": 450,
  "selecting-month": 450,
  month: 2200,
  "opening-week-menu": 450,
  "selecting-week": 450,
};

const strengthTask: SeededTask = {
  id: "strength",
  label: "Strength",
  tone: "emerald",
};

const seededDays = [
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
    tasks: [{ id: "tempo-run", label: "Tempo run", tone: "blue" }],
  },
  {
    id: "thu",
    day: "Thu",
    date: "15",
    tasks: [{ id: "launch-copy", label: "Launch copy", tone: "violet" }],
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
    tasks: [{ id: "weekly-review", label: "Weekly review", tone: "emerald" }],
  },
] as const;

const monthActivity: Record<
  number,
  { label?: string; tone: TaskTone }
> = {
  4: { tone: "blue" },
  8: { tone: "emerald" },
  12: { label: "Plan", tone: "violet" },
  15: { label: "Launch", tone: "amber" },
  18: { tone: "emerald" },
  24: { label: "Review", tone: "blue" },
  29: { tone: "violet" },
};

const monthDates = Array.from({ length: 35 }, (_, index) =>
  index < 2 || index > 32 ? null : index - 1
);

export function nextPlannerDemoPhase(
  phase: PlannerDemoPhase,
  reducedMotion: boolean
): PlannerDemoPhase {
  if (reducedMotion) {
    if (phase === "editing") {
      return "saving";
    }
    if (phase === "saving") {
      return "saved";
    }
    if (phase === "saved") {
      return "month";
    }
    if (phase === "month") {
      return "editing";
    }
    return "editing";
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

function TaskTile({
  task,
  className = "",
}: {
  task: SeededTask;
  className?: string;
}) {
  return (
    <p
      className={`min-h-7 whitespace-normal break-normal rounded-md border px-1.5 py-1 text-[9px] leading-[1.2] [overflow-wrap:normal] [word-break:normal] ${toneClassName(
        task.tone
      )} ${className}`}
    >
      {task.label}
    </p>
  );
}

export function LandingPlannerPreview() {
  const reducedMotion = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<PlannerDemoPhase>("editing");
  const [isVisible, setIsVisible] = useState(false);
  const [flight, setFlight] = useState<FlightGeometry | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const destinationRef = useRef<HTMLDivElement | null>(null);

  const isTravelPhase =
    phase === "lifting" || phase === "moving" || phase === "settling";
  const showDestination =
    phase === "saving" ||
    phase === "saved" ||
    phase === "opening-month-menu" ||
    phase === "selecting-month";
  const isMonthView =
    phase === "month" ||
    phase === "opening-week-menu" ||
    phase === "selecting-week";
  const isViewMenuOpen =
    phase === "opening-month-menu" ||
    phase === "selecting-month" ||
    phase === "opening-week-menu" ||
    phase === "selecting-week";
  const isSelectingMonth = phase === "selecting-month";
  const isSelectingWeek = phase === "selecting-week";

  const measureFlight = useCallback(() => {
    const calendar = calendarRef.current;
    const source = sourceRef.current;
    const destination = destinationRef.current;
    if (!calendar || !source || !destination) {
      return;
    }

    const calendarRect = calendar.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    setFlight({
      left: sourceRect.left - calendarRect.left,
      top: sourceRect.top - calendarRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
      deltaX: destinationRect.left - sourceRect.left,
      deltaY: destinationRect.top - sourceRect.top,
    });
  }, []);

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
    if (!isVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPhase((current) => nextPlannerDemoPhase(current, reducedMotion));
    }, phaseDurationMs[phase]);

    return () => window.clearTimeout(timeoutId);
  }, [isVisible, phase, reducedMotion]);

  useLayoutEffect(() => {
    if (!isTravelPhase) {
      return;
    }
    measureFlight();
  }, [isTravelPhase, measureFlight]);

  useEffect(() => {
    if (!isTravelPhase) {
      return;
    }
    window.addEventListener("resize", measureFlight);
    return () => window.removeEventListener("resize", measureFlight);
  }, [isTravelPhase, measureFlight]);

  const currentView = isMonthView ? "Month" : "Week";
  const statusNote =
    phase === "saving"
      ? "Saving updated plan..."
      : phase === "saved"
        ? "Plan saved"
        : phase === "opening-month-menu" || phase === "selecting-month"
          ? "Switching to Month"
          : phase === "month"
            ? "August overview"
            : phase === "opening-week-menu" || phase === "selecting-week"
              ? "Returning to Week"
              : isTravelPhase
                ? "Moving Strength to Thursday"
                : "Rebalancing this week";

  const flightPosition =
    phase === "lifting"
      ? { x: 0, y: -28, scale: 1.06 }
      : phase === "moving"
        ? {
            x: flight?.deltaX ?? 0,
            y: (flight?.deltaY ?? 0) - 28,
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
                className="absolute right-0 top-9 z-40 w-28 rounded-lg border bg-card p-1 text-xs shadow-lg"
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
      <CardContent className="space-y-3">
        {isMonthView ? (
          <motion.div
            key="month"
            data-calendar-view="month"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <p
                  key={day}
                  className="text-center text-[9px] font-semibold text-muted-foreground"
                >
                  {day}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthDates.map((date, index) => {
                const activity = date ? monthActivity[date] : undefined;
                return (
                  <div
                    key={`${date ?? "empty"}-${index}`}
                    className={`min-h-11 rounded-md border p-1.5 ${
                      date ? "bg-muted/20" : "border-transparent"
                    }`}
                  >
                    {date ? (
                      <>
                        <p className="text-[9px] text-muted-foreground">{date}</p>
                        {activity ? (
                          <div className="mt-1 flex items-center gap-1">
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${toneDotClassName(
                                activity.tone
                              )}`}
                            />
                            {activity.label ? (
                              <span className="truncate text-[8px] font-medium">
                                {activity.label}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="week"
            ref={calendarRef}
            data-calendar-view="week"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
          >
            <div className="grid grid-cols-7 gap-2">
              {seededDays.map((day) => (
                <div
                  key={day.id}
                  className="min-w-0 rounded-lg border bg-muted/20 p-1.5"
                >
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    {day.day}
                  </p>
                  <p className="mb-1 text-[10px] text-muted-foreground">
                    {day.date}
                  </p>
                  <div className="space-y-1">
                    {day.id === "tue" ? (
                      <div ref={sourceRef}>
                        <TaskTile
                          task={strengthTask}
                          className={phase === "editing" ? "" : "invisible"}
                        />
                      </div>
                    ) : null}

                    {day.tasks.map((task) => (
                      <TaskTile key={task.id} task={task} />
                    ))}

                    {day.id === "thu" ? (
                      <div ref={destinationRef} aria-hidden={!showDestination}>
                        {showDestination ? (
                          <TaskTile task={strengthTask} />
                        ) : (
                          <div className="min-h-7" />
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {isTravelPhase && flight ? (
              <motion.div
                data-moving-task="strength"
                className={`pointer-events-none absolute z-20 min-h-7 whitespace-normal break-normal rounded-md border px-1.5 py-1 text-[9px] leading-[1.2] shadow-[0_10px_24px_rgba(37,99,235,0.25)] [overflow-wrap:normal] [word-break:normal] ${toneClassName(
                  strengthTask.tone
                )}`}
                initial={{ x: 0, y: 0, scale: 1 }}
                animate={flightPosition}
                transition={{
                  duration:
                    phase === "moving" ? 0.85 : phase === "settling" ? 0.32 : 0.3,
                  ease: "easeInOut",
                }}
                style={{
                  left: flight.left,
                  top: flight.top,
                  width: flight.width,
                  minHeight: flight.height,
                }}
              >
                {strengthTask.label}
              </motion.div>
            ) : null}
          </motion.div>
        )}

        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
          {phase === "saving" ? (
            <Loader2 className="size-3 animate-spin text-blue-600" />
          ) : phase === "saved" ? (
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
