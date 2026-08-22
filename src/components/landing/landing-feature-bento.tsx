import {
  ArrowRight,
  CalendarClock,
  Check,
  MessageSquareText,
  RotateCcw,
  Sparkles,
} from "lucide-react";

function CoachCard() {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-blue-50 p-5 shadow-sm sm:p-7">
      <div className="absolute -top-20 -right-16 size-52 rounded-full bg-violet-200/35 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-600 text-white">
              <Sparkles className="size-4" />
            </span>
            <div>
              <h3 className="font-semibold tracking-tight">AI Coach</h3>
              <p className="text-[10px] text-muted-foreground">
                Guidance grounded in your monthly plan
              </p>
            </div>
          </div>
          <span className="rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1 text-[10px] font-semibold text-violet-800">
            Beta
          </span>
        </div>

        <div className="mt-5 space-y-3">
          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-xs leading-relaxed text-white shadow-sm">
            Help me build a 4-week running routine around my launch schedule.
          </div>
          <div className="max-w-[94%] rounded-2xl rounded-tl-sm border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquareText className="size-3.5 text-violet-700" />
              <p className="text-[10px] font-semibold text-violet-900">
                Coach proposal
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-700">
              Start with three weekly runs, keep Monday as recovery, and protect
              Thursday for launch work.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5">
                <p className="text-[9px] font-semibold text-violet-900">
                  Editable goal draft
                </p>
                <p className="mt-1 text-[9px] text-violet-700">
                  Run 3× weekly · 4 weeks
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-2.5">
                <p className="text-[9px] font-semibold text-blue-900">
                  Schedule change
                </p>
                <p className="mt-1 text-[9px] text-blue-700">
                  Set Monday as a rest day
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
              <span className="text-[9px] text-muted-foreground">
                2 draft changes · Nothing applied yet
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[9px] font-semibold text-white">
                Review proposal
                <ArrowRight className="size-3" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function RecoveryCard() {
  return (
    <article className="overflow-hidden rounded-3xl border border-orange-200 bg-orange-50/55 p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-orange-600 text-white">
            <RotateCcw className="size-4" />
          </span>
          <h3 className="mt-4 text-xl font-semibold tracking-tight">
            Recover your rhythm
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A disrupted day does not ruin the plan. Automatically adjust unfinished
            sessions into dates that still work.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-orange-200 bg-white p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500">
              <CalendarClock className="size-3" />
              Last week
            </div>
            <p className="mt-2 text-[10px] font-medium text-slate-700 line-through">
              Tempo run
            </p>
            <p className="mt-1 text-[8px] text-slate-500">Incomplete</p>
          </div>
          <ArrowRight className="size-4 text-orange-600" />
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700">
              <Check className="size-3" />
              Next opening
            </div>
            <p className="mt-2 text-[10px] font-medium text-emerald-950">
              Tempo run
            </p>
            <p className="mt-1 text-[8px] text-emerald-700">Friday · 7:00 AM</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-orange-100/70 px-3 py-2">
          <span className="text-[9px] font-medium text-orange-900">
            2 sessions re-placed
          </span>
          <span className="text-[8px] text-orange-700">Ready to save</span>
        </div>
      </div>
    </article>
  );
}

export function LandingFeatureBento() {
  return (
    <section className="border-b bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-violet-700 uppercase">
            Adapt without starting over
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Support when the plan gets complicated.
          </h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <CoachCard />
          <RecoveryCard />
        </div>
      </div>
    </section>
  );
}
