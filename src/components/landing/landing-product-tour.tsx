import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Globe2,
  Heart,
  LineChart,
  ListChecks,
  Pencil,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { LandingGoalCreationDemo } from "@/components/landing/landing-goal-creation-demo";
import { LandingPlannerSurfaceTour } from "@/components/landing/landing-planner-surface-tour";

const heatmapLevels = Array.from({ length: 140 }, (_, index) => {
  const pattern = [0, 1, 0, 2, 3, 0, 1, 2, 4, 3, 1, 2, 0, 3, 4, 2] as const;
  return pattern[index % pattern.length];
});

const heatmapClasses = [
  "bg-slate-100",
  "bg-emerald-100",
  "bg-emerald-300",
  "bg-emerald-500",
  "bg-emerald-700",
] as const;

function TourPanel({
  eyebrow,
  title,
  description,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <article className="grid items-center gap-8 rounded-3xl border bg-background p-5 shadow-sm sm:p-8 md:grid-cols-2 md:gap-12">
      <div className={reverse ? "md:order-2" : ""}>
        <p className="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className={reverse ? "md:order-1" : ""}>{visual}</div>
    </article>
  );
}

function InsightsVisual() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[0_18px_55px_-35px_rgba(5,150,105,0.5)]">
      <div>
        <p className="text-xs font-semibold">Morning run</p>
        <p className="text-[10px] text-muted-foreground">
          80% · 12/15 completions
        </p>
      </div>

      <div className="mt-4 w-full min-w-0">
        <div className="mb-1 flex w-full justify-between text-[8px] text-muted-foreground">
          <span>Apr</span>
          <span>May</span>
          <span>Jun</span>
          <span>Jul</span>
          <span>Aug</span>
        </div>
        <div
          data-testid="insights-heatmap"
          className="grid h-[72px] w-full grid-flow-col grid-rows-7 auto-cols-fr gap-[3px]"
        >
          {heatmapLevels.map((level, index) => {
            const selected = index === 118;
            return (
              <span
                key={`${level}-${index}`}
                data-testid="heatmap-cell"
                role={selected ? "img" : undefined}
                aria-label={
                  selected ? "August 10 selected for history edit" : undefined
                }
                className={`min-w-0 rounded-[2px] ${heatmapClasses[level]} ${
                  selected ? "ring-2 ring-blue-500 ring-offset-1" : ""
                }`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
          <span>Less</span>
          {heatmapClasses.map((className) => (
            <span key={className} className={`size-2.5 rounded-[2px] ${className}`} />
          ))}
          <span>More</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-medium text-blue-700">
            Aug 10 selected
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-medium">
            <Pencil className="size-3" />
            Edit history
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-emerald-50/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LineChart className="size-3.5 text-emerald-700" />
            <span className="text-[10px] font-medium">30-day completion rate</span>
          </div>
          <span className="text-[9px] font-medium text-emerald-800">+14%</span>
        </div>
        <svg
          viewBox="0 0 280 70"
          className="mt-2 h-16 w-full"
          role="img"
          aria-label="Completion rate trending upward over thirty days"
        >
          <path
            d="M2 58 C35 54, 44 60, 70 45 S112 50, 138 31 S180 36, 210 20 S246 26, 278 8"
            fill="none"
            stroke="rgb(5 150 105)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M2 58 C35 54, 44 60, 70 45 S112 50, 138 31 S180 36, 210 20 S246 26, 278 8 L278 70 L2 70 Z"
            fill="rgb(209 250 229)"
            opacity="0.65"
          />
        </svg>
      </div>
    </div>
  );
}

function CommunityVisual() {
  const leaderboard = [
    { rank: 1, name: "Maya", xp: "4,280 XP" },
    { rank: 2, name: "You", xp: "3,940 XP" },
    { rank: 3, name: "Alex", xp: "3,760 XP" },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800">
              AL
            </span>
            <div>
              <p className="text-[11px] font-semibold">Alex completed a weekly goal</p>
              <p className="text-[9px] text-muted-foreground">Community · 12m</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2">
            <span className="text-[10px] font-medium text-violet-900">
              Run three times this week
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-violet-800">
              <Heart className="size-3" />
              Cheer
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold tracking-wide text-blue-700 uppercase">
                Your duo
              </p>
              <p className="mt-1 text-[11px] font-medium text-blue-950">
                You + Alex · 7,700 XP
              </p>
            </div>
            <Users className="size-5 text-blue-700" />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-blue-200 bg-white px-3 py-2">
            <span className="text-[9px] text-blue-900">Momentum nudge</span>
            <span className="rounded-full bg-blue-600 px-2 py-1 text-[8px] font-semibold text-white">
              Send
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-600" />
          <p className="text-[11px] font-semibold">Season leaderboard</p>
        </div>
        <div className="mt-3 space-y-2">
          {leaderboard.map((row) => (
            <div
              key={row.rank}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                row.name === "You" ? "border-blue-300 bg-blue-50" : ""
              }`}
            >
              <span className="text-[10px] font-semibold text-muted-foreground">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">
                {row.name}
              </span>
              <span className="text-[8px] text-muted-foreground">{row.xp}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-[9px] text-muted-foreground">
          <span>Weekly XP Sprint</span>
          <ChevronRight className="size-3" />
        </div>
      </div>
    </div>
  );
}

function PersonalizationStrip() {
  const preferences = [
    { icon: Globe2, label: "New York timezone" },
    { icon: CalendarDays, label: "Week starts Monday" },
    { icon: ListChecks, label: "Calendar first" },
    { icon: Bell, label: "Daily reminder · 9 PM" },
    { icon: ShieldCheck, label: "Social activity visible" },
  ] as const;

  return (
    <div className="rounded-3xl border bg-gradient-to-r from-slate-50 via-white to-blue-50 p-5 shadow-sm sm:p-6">
      <div className="grid items-center gap-5 md:grid-cols-[0.65fr_2fr]">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            JO
          </span>
          <div>
            <p className="text-xs font-semibold">Make it yours</p>
            <p className="text-[10px] text-muted-foreground">
              Profile, planner, reminders, privacy
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {preferences.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-[9px] font-medium shadow-sm"
            >
              <Icon className="size-3 text-blue-700" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingProductTour() {
  return (
    <section className="border-b bg-slate-50/60">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">
            Inside Goalmaxxing
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for the full loop
          </h2>
          <p className="mt-4 text-muted-foreground sm:text-lg">
            Start from a sentence, execute your way, understand the pattern, and
            keep the right people close.
          </p>
        </div>

        <TourPanel
          eyebrow="Create"
          title="Start in one sentence"
          description="Describe the plan in natural language, or configure every field yourself. Review the drafts, then create them in one click."
          visual={<LandingGoalCreationDemo />}
        />
        <TourPanel
          eyebrow="Planner"
          title="Execute your way"
          description="Use the visual calendar when timing matters, then switch to a focused checklist when it is time to work. Recurring goals and one-time tasks stay distinct."
          visual={<LandingPlannerSurfaceTour />}
          reverse
        />
        <TourPanel
          eyebrow="Insights"
          title="See your patterns"
          description="Heatmaps, completion rates, and thirty-day trends reveal what is compounding. Easily edit past completion when needed so nothing is missed."
          visual={<InsightsVisual />}
        />
        <TourPanel
          eyebrow="Community"
          title="Progress together"
          description="Celebrate real progress in the feed, compete in seasonal leaderboards, and build a focused accountability loop with one trusted partner."
          visual={<CommunityVisual />}
          reverse
        />
        <PersonalizationStrip />
      </div>
    </section>
  );
}
