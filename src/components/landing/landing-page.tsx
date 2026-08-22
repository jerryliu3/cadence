"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Milestone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureCardItem {
  title: string;
  description: string;
  icon: LucideIcon;
  detail: string;
}

interface PlannerEntry {
  id: string;
  label: string;
  dayIndex: number;
  toneClassName: string;
}

const featureCards: FeatureCardItem[] = [
  {
    title: "Plan with clarity",
    description:
      "Design execution blocks for short-term pushes and long-term outcomes in one planner.",
    detail:
      "See weekly sessions and milestone checkpoints side by side so strategy stays visible.",
    icon: CalendarDays,
  },
  {
    title: "Track real progress",
    description:
      "Measure progress against outcomes and milestones, not just checked boxes.",
    detail:
      "Spot trends over weeks and months so you can adjust before momentum drops.",
    icon: BarChart3,
  },
  {
    title: "Stay accountable",
    description:
      "Keep commitments visible with partner check-ins and focused social accountability.",
    detail:
      "Share progress intentionally while keeping control over private and public surfaces.",
    icon: Users,
  },
];

const plannerDays = [
  "Mon 04",
  "Tue 05",
  "Wed 06",
  "Thu 07",
  "Fri 08",
  "Sat 09",
  "Sun 10",
  "Mon 11",
  "Tue 12",
  "Wed 13",
  "Thu 14",
  "Fri 15",
  "Sat 16",
  "Sun 17",
] as const;

const seededPlannerEntries: PlannerEntry[] = [
  {
    id: "deep-work",
    label: "Deep work block",
    dayIndex: 1,
    toneClassName: "bg-blue-500/90 text-white",
  },
  {
    id: "shipping",
    label: "Ship milestone",
    dayIndex: 3,
    toneClassName: "bg-violet-500/90 text-white",
  },
  {
    id: "review",
    label: "Weekly review",
    dayIndex: 6,
    toneClassName: "bg-emerald-500/90 text-white",
  },
  {
    id: "training",
    label: "Training run",
    dayIndex: 10,
    toneClassName: "bg-cyan-500/90 text-white",
  },
  {
    id: "partner-checkin",
    label: "Partner check-in",
    dayIndex: 12,
    toneClassName: "bg-rose-500/90 text-white",
  },
];

const movedPlannerEntries: PlannerEntry[] = seededPlannerEntries.map((entry) =>
  entry.id === "deep-work" ? { ...entry, dayIndex: 2 } : entry
);

type PlannerDemoPhase = "seeded" | "moving" | "saved";

const primaryCtaClassName =
  "border-blue-700 bg-blue-700 hover:border-blue-800 hover:bg-blue-800";
const primaryCtaTextStyle = { color: "#ffffff" } as const;

function PlannerWeekDemo() {
  const [phase, setPhase] = useState<PlannerDemoPhase>("seeded");
  useEffect(() => {
    const phases: PlannerDemoPhase[] = ["seeded", "moving", "saved"];
    const intervalId = window.setInterval(() => {
      setPhase((current) => phases[(phases.indexOf(current) + 1) % phases.length] ?? "seeded");
    }, 2200);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const entries = phase === "seeded" ? seededPlannerEntries : movedPlannerEntries;
  const statusCopy =
    phase === "seeded"
      ? "Seeded weekly plan"
      : phase === "moving"
      ? "Rebalancing the week..."
      : "Saved and ready";

  return (
    <Card className="overflow-hidden border shadow-sm">
      <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500" />
      <CardHeader className="pb-3">
        <CardTitle className="text-base">What your week looks like</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">{statusCopy}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1",
              phase === "saved"
                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                : "border-blue-200 bg-blue-100 text-blue-700"
            )}
          >
            {phase === "saved" ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}
            {phase === "saved" ? "Plan saved" : "Editing"}
          </span>
        </div>

        <div className="relative">
          <div className="grid grid-cols-7 gap-1.5">
            {plannerDays.map((day, dayIndex) => {
              const dayEntries = entries.filter((entry) => entry.dayIndex === dayIndex);
              return (
                <div
                  key={day}
                  className="min-h-14 rounded-md border border-border/70 bg-muted/20 p-1"
                >
                  <p className="text-[10px] font-medium text-muted-foreground">{day}</p>
                  <div className="mt-1 space-y-1">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={cn(
                          "rounded px-1 py-0.5 text-[9px] font-medium leading-tight",
                          entry.toneClassName
                        )}
                      >
                        {entry.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {phase === "moving" ? (
            <div
              className="pointer-events-none absolute left-[14%] top-[2.45rem] rounded border border-blue-300 bg-blue-500 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm"
              style={{ animation: "plannerMove 0.9s ease-in-out forwards" }}
            >
              Deep work block
            </div>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Fake seeded plan data shown here. We auto-rebalance one session, then save to lock
          execution for the week.
        </p>
      </CardContent>
      <style jsx>{`
        @keyframes plannerMove {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 0.95;
          }
          100% {
            transform: translate(52px, 0) scale(0.98);
            opacity: 0.15;
          }
        }
      `}</style>
    </Card>
  );
}

function FeatureVisualPanel({ activeFeatureIndex }: { activeFeatureIndex: number }) {
  if (activeFeatureIndex === 0) {
    return (
      <div className="space-y-3 rounded-xl border bg-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Weekly focus map
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border bg-blue-50 p-2 text-blue-900">
            <p className="font-semibold">Short-term sprint</p>
            <p>Finish launch checklist by Friday.</p>
          </div>
          <div className="rounded border bg-violet-50 p-2 text-violet-900">
            <p className="font-semibold">Long-term goal</p>
            <p>Publish 12 deep-work weeks this quarter.</p>
          </div>
          <div className="rounded border bg-emerald-50 p-2 text-emerald-900">
            <p className="font-semibold">Milestones</p>
            <p>Draft, review, ship checkpoint sequence.</p>
          </div>
          <div className="rounded border bg-cyan-50 p-2 text-cyan-900">
            <p className="font-semibold">Execution slots</p>
            <p>Calendar blocks tied to actual sessions.</p>
          </div>
        </div>
      </div>
    );
  }

  if (activeFeatureIndex === 1) {
    return (
      <div className="space-y-3 rounded-xl border bg-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Outcome progress
        </p>
        <div className="space-y-2 text-xs">
          <div>
            <div className="mb-1 flex justify-between">
              <span>Quarter objective</span>
              <span className="font-semibold">64%</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full w-[64%] rounded-full bg-blue-500 transition-all duration-500" />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <span>Current weekly plan adherence</span>
              <span className="font-semibold">82%</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full w-[82%] rounded-full bg-emerald-500 transition-all duration-500" />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <span>Milestones completed</span>
              <span className="font-semibold">9 / 14</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full w-[64%] rounded-full bg-violet-500 transition-all duration-500" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Accountability snapshot
      </p>
      <div className="space-y-2 text-xs">
        <div className="rounded border bg-muted/30 p-2">
          <p className="font-semibold">Partner check-in</p>
          <p className="text-muted-foreground">Next sync today at 6:30 PM</p>
        </div>
        <div className="rounded border bg-muted/30 p-2">
          <p className="font-semibold">Weekly commitment</p>
          <p className="text-muted-foreground">4/5 planned sessions completed</p>
        </div>
        <div className="rounded border bg-muted/30 p-2">
          <p className="font-semibold">Visibility controls</p>
          <p className="text-muted-foreground">Private milestones hidden, progress summary shared</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const featureRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let nextIndex: number | null = null;
        let highestRatio = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const parsedIndex = Number(entry.target.getAttribute("data-feature-index"));
          if (!Number.isFinite(parsedIndex)) {
            continue;
          }
          if (entry.intersectionRatio >= highestRatio) {
            highestRatio = entry.intersectionRatio;
            nextIndex = parsedIndex;
          }
        }
        if (nextIndex === null) {
          return;
        }
        setActiveFeatureIndex((current) => (current === nextIndex ? current : nextIndex));
      },
      {
        threshold: [0.25, 0.5, 0.75],
        rootMargin: "-15% 0px -35% 0px",
      }
    );

    for (const featureRef of featureRefs.current) {
      if (featureRef) {
        observer.observe(featureRef);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const activeFeature = useMemo(
    () => featureCards[activeFeatureIndex] ?? featureCards[0],
    [activeFeatureIndex]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Goalmaxxing
          </Link>
          <nav aria-label="Landing actions" className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className={primaryCtaClassName}
              style={primaryCtaTextStyle}
            >
              <Link href="/signup">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div className="space-y-6">
            <p className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Short-term wins + long-term outcomes
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Achieve short-term and long-term goals, not another to-do list or daily habit tracker.
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              Goalmaxxing combines planning, execution, measurable progress, and
              accountability so your goals compound across weeks and months.
            </p>
            <div data-testid="hero-primary-actions" className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                variant="outline"
                size="lg"
                className={primaryCtaClassName}
                style={primaryCtaTextStyle}
              >
                <Link href="/app">
                  Go to app
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <PlannerWeekDemo />
        </section>

        <section className="border-y bg-card/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <div className="mb-6 max-w-2xl space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Scroll to see your plan story unfold
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                As you scroll, the visual panel updates automatically to show how planning,
                progress, and accountability work together.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {featureCards.map(({ title, description, detail, icon: Icon }, index) => (
                  <div
                    key={title}
                    ref={(node) => {
                      featureRefs.current[index] = node;
                    }}
                    data-feature-index={index}
                    className="min-h-52 md:min-h-[52vh]"
                  >
                    <Card
                      aria-current={activeFeatureIndex === index ? "step" : undefined}
                      className={cn(
                        "h-full shadow-sm transition-all duration-300",
                        activeFeatureIndex === index
                          ? "border-primary/50 ring-1 ring-primary/25"
                          : "opacity-80"
                      )}
                    >
                      <CardHeader className="space-y-3">
                        <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <CardTitle className="text-lg">{title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground">{description}</p>
                        <p className="text-xs font-medium text-foreground/80">{detail}</p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>

              <div className="md:sticky md:top-24 md:self-start">
                <Card className="shadow-sm">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base">{activeFeature.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{activeFeature.description}</p>
                  </CardHeader>
                  <CardContent>
                    <FeatureVisualPanel activeFeatureIndex={activeFeatureIndex} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Build momentum that compounds.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Align your short-term execution with long-term outcomes, then review and adjust each week.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              variant="outline"
              size="lg"
              className={primaryCtaClassName}
              style={primaryCtaTextStyle}
            >
              <Link href="/app">Go to app</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/signup">Create account</Link>
            </Button>
          </div>
          <div className="mx-auto mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 inline-flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <Milestone className="size-4" />
              </div>
              <p className="text-sm font-semibold">Outcome-first planning</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Translate long-term goals into weekly execution blocks.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 inline-flex size-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                <BarChart3 className="size-4" />
              </div>
              <p className="text-sm font-semibold">Measurable momentum</p>
              <p className="mt-1 text-xs text-muted-foreground">
                See trendlines and milestone completion, not just done/not done.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 inline-flex size-8 items-center justify-center rounded-md bg-violet-100 text-violet-700">
                <ShieldCheck className="size-4" />
              </div>
              <p className="text-sm font-semibold">Intentional accountability</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share the right signals with partners while keeping control.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 text-sm text-muted-foreground sm:px-6">
          <span>Goalmaxxing</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
