"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Repeat2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const featureScenes = [
  {
    title: "Too habit-focused",
    summary: "Streaks reward repetition, not meaningful outcomes.",
    reasoning:
      "Goalmaxxing plans beyond daily habits so today's actions still connect to the weeks and months ahead.",
    icon: Repeat2,
  },
  {
    title: "Too rigid",
    summary: "Real goals do not always follow fixed daily patterns.",
    reasoning:
      "When a day slips, unfinished sessions can move to dates that still work—without throwing away the month.",
    icon: CalendarClock,
  },
  {
    title: "Too isolated",
    summary: "Progress is harder without shared accountability.",
    reasoning:
      "Celebrate real progress in Community, keep one trusted partner close, and control what stays visible.",
    icon: Users,
  },
] as const;

export const accountabilityEvents = [
  {
    kind: "feed",
    eyebrow: "Community",
    copy: "Alex completed a weekly goal.",
    action: "Cheer",
  },
  {
    kind: "nudge",
    eyebrow: "Duo",
    copy: "Alex sent a momentum nudge.",
    action: "Keep going",
  },
] as const;

export function selectFeatureIndex(cardCenters: number[], anchor: number) {
  if (cardCenters.length === 0) {
    return 0;
  }

  return cardCenters.reduce((best, center, index) => {
    const bestDistance = Math.abs(cardCenters[best] - anchor);
    return Math.abs(center - anchor) < bestDistance ? index : best;
  }, 0);
}

function FeatureSceneVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="w-full rounded-xl border bg-blue-50/70 p-4">
        <p className="text-xs font-medium text-blue-950">Outcome over repetition</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="font-semibold text-slate-500">Daily only</p>
            <p className="mt-1 text-slate-600">Check the box again tomorrow</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-white p-2.5">
            <p className="font-semibold text-blue-900">Week and month</p>
            <p className="mt-1 text-blue-700">Ship onboarding · Raise activation</p>
          </div>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="w-full rounded-xl border bg-orange-50/70 p-4">
        <p className="text-xs font-medium text-orange-950">Keep the plan moving</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-2.5">
            <p className="font-semibold text-slate-500">Missed Thursday</p>
            <p className="mt-1 text-slate-600 line-through">Tempo run</p>
          </div>
          <span className="text-orange-700">→</span>
          <div className="rounded-lg border border-emerald-200 bg-white p-2.5">
            <p className="font-semibold text-emerald-800">Next opening</p>
            <p className="mt-1 text-emerald-950">Friday · 7:00 AM</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border bg-violet-50/70 p-3.5">
      <p className="text-xs font-medium text-violet-950">Accountability loop</p>
      <div className="mt-3 space-y-2 text-[11px]">
        {accountabilityEvents.map((event) => (
          <div
            key={event.kind}
            className="rounded-lg border border-violet-200 bg-white p-2.5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-violet-900">{event.eyebrow}</p>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-medium text-violet-800">
                {event.action}
              </span>
            </div>
            <p className="mt-1 text-violet-800">{event.copy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingFeatureNarrative() {
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const featureRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let frameId: number | null = null;

    const updateActiveFeature = () => {
      frameId = null;
      const centers = featureRefs.current.flatMap((element) => {
        if (!element) {
          return [];
        }
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const nextIndex = selectFeatureIndex(centers, window.innerHeight * 0.45);
      setActiveFeatureIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(updateActiveFeature);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  const activeFeatureScene =
    featureScenes[activeFeatureIndex] ?? featureScenes[0];

  return (
    <section
      id="why-goalmaxxing"
      className="scroll-mt-20 border-y bg-card/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-orange-700 uppercase">
            Why Goalmaxxing
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Most productivity apps stop at today.
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Real goals change week to week. They need room to adapt, a view of what
            comes next, and people who help you keep moving.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 md:items-start md:gap-10">
          <div className="space-y-6">
            {featureScenes.map(({ title, summary, reasoning, icon: Icon }, index) => (
              <article
                key={title}
                ref={(element) => {
                  featureRefs.current[index] = element;
                }}
                data-feature-index={index}
                data-feature-active={activeFeatureIndex === index}
                className={`flex min-h-[220px] flex-col justify-center rounded-2xl border p-5 transition duration-300 md:h-[clamp(320px,42vh,420px)] md:min-h-0 ${
                  activeFeatureIndex === index
                    ? "border-orange-300 bg-card shadow-[0_16px_50px_-30px_rgba(234,88,12,0.45)]"
                    : "border-border/80 bg-background/60"
                }`}
              >
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-800">
                  <Icon className="size-4" />
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {summary}
                </p>
                <div className="mt-4 md:hidden">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {reasoning}
                  </p>
                  <div className="mt-4">
                    <FeatureSceneVisual index={index} />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden md:sticky md:top-24 md:block md:h-[clamp(320px,42vh,420px)] md:self-start">
            <Card className="relative h-full min-h-[260px] overflow-hidden border shadow-sm md:min-h-0">
              <CardHeader className="pb-3">
                <CardTitle
                  className="text-base"
                  data-feature-scene={activeFeatureIndex}
                  aria-live="polite"
                >
                  {activeFeatureScene.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative min-h-[190px] md:h-[calc(100%-4rem)]">
                {featureScenes.map((scene, index) => (
                  <div
                    key={scene.title}
                    aria-hidden={activeFeatureIndex !== index}
                    className={`absolute inset-0 flex items-center px-5 pb-5 transition duration-400 ${
                      activeFeatureIndex === index
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-2 opacity-0"
                    }`}
                  >
                    <div className="w-full space-y-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {scene.reasoning}
                      </p>
                      <FeatureSceneVisual index={index} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
