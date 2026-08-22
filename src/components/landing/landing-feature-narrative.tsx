"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const featureScenes = [
  {
    title: "Plan with clarity",
    description:
      "Shape short-term actions and long-term milestones in one planner so each day serves the bigger outcome.",
    supportingText:
      "Map recurring effort, fixed dates, and linked outcomes in the same weekly plan.",
    icon: CalendarDays,
  },
  {
    title: "Track real progress",
    description:
      "Measure follow-through with completion trends and momentum signals, not just checked boxes.",
    supportingText:
      "See which goals are compounding and where your execution plan needs a reset.",
    icon: BarChart3,
  },
  {
    title: "Stay accountable",
    description:
      "Keep trusted accountability loops around your goals without turning your plan into a noisy social feed.",
    supportingText:
      "Share progress snapshots, request feedback, and keep ownership of what is visible.",
    icon: Users,
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
    <section className="border-y bg-card/30">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:items-start md:gap-10">
        <div className="space-y-6">
          {featureScenes.map(
            ({ title, description, supportingText, icon: Icon }, index) => (
              <article
                key={title}
                ref={(element) => {
                  featureRefs.current[index] = element;
                }}
                data-feature-index={index}
                data-feature-active={activeFeatureIndex === index}
                className={`flex min-h-[260px] flex-col justify-center rounded-2xl border p-5 transition duration-300 md:h-[clamp(280px,38vh,360px)] md:min-h-0 ${
                  activeFeatureIndex === index
                    ? "border-blue-400/70 bg-card shadow-[0_16px_50px_-30px_rgba(37,99,235,0.55)]"
                    : "border-border/80 bg-background/60"
                }`}
              >
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                  {description}
                </p>
                <p className="mt-2 text-sm text-muted-foreground/90">
                  {supportingText}
                </p>
              </article>
            )
          )}
        </div>

        <div className="md:sticky md:top-24 md:h-[clamp(280px,38vh,360px)] md:self-start">
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
              <div
                aria-hidden={activeFeatureIndex !== 0}
                className={`absolute inset-0 flex items-center px-5 pb-5 transition duration-400 ${
                  activeFeatureIndex === 0
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                }`}
              >
                <div className="w-full rounded-xl border bg-blue-50/70 p-4">
                  <p className="text-xs font-medium text-blue-950">Sprint focus map</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-blue-200 bg-white p-2.5">
                      <p className="font-semibold text-blue-900">Short-term</p>
                      <p className="mt-1 text-blue-700">Ship onboarding flow</p>
                    </div>
                    <div className="rounded-lg border border-violet-200 bg-white p-2.5">
                      <p className="font-semibold text-violet-900">Long-term</p>
                      <p className="mt-1 text-violet-700">Raise weekly activation</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-blue-900/80">
                    Every daily task links back to one outcome target.
                  </p>
                </div>
              </div>

              <div
                aria-hidden={activeFeatureIndex !== 1}
                className={`absolute inset-0 flex items-center px-5 pb-5 transition duration-400 ${
                  activeFeatureIndex === 1
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                }`}
              >
                  <div className="w-full rounded-xl border bg-emerald-50/65 p-3.5">
                  <p className="text-xs font-medium text-emerald-950">Progress pulse</p>
                  <div className="mt-3 space-y-2.5">
                    {[
                      { label: "Execution score", value: 82 },
                      { label: "Goal momentum", value: 74 },
                      { label: "Weekly consistency", value: 91 },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-900">{metric.label}</span>
                          <span className="font-medium text-emerald-950">
                            {metric.value}%
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-emerald-100">
                          <div
                            className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${metric.value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                aria-hidden={activeFeatureIndex !== 2}
                className={`absolute inset-0 flex items-center px-5 pb-5 transition duration-400 ${
                  activeFeatureIndex === 2
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                }`}
              >
                  <div className="w-full rounded-xl border bg-violet-50/70 p-3.5">
                  <p className="text-xs font-medium text-violet-950">
                    Accountability loop
                  </p>
                  <div className="mt-3 space-y-2 text-[11px]">
                    <div className="rounded-lg border border-violet-200 bg-white p-2.5">
                      <p className="font-medium text-violet-900">Alex</p>
                      <p className="mt-0.5 text-violet-800">
                        Nice rebound after Tuesday.
                      </p>
                    </div>
                    <div className="rounded-lg border border-violet-200 bg-white p-2.5">
                      <p className="font-medium text-violet-900">You</p>
                      <p className="mt-0.5 text-violet-800">
                        Locked Thursday focus block to protect launch work.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
