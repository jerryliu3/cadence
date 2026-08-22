import { CalendarClock, Repeat2, Users } from "lucide-react";

const frustrations = [
  {
    title: "Too habit-focused",
    description: "Streaks reward repetition, not meaningful outcomes.",
    icon: Repeat2,
  },
  {
    title: "Too rigid",
    description: "Real goals do not always follow fixed daily patterns.",
    icon: CalendarClock,
  },
  {
    title: "Too isolated",
    description: "Progress is harder without shared accountability.",
    icon: Users,
  },
] as const;

export function LandingWhyGoalmaxxing() {
  return (
    <section
      id="why-goalmaxxing"
      className="scroll-mt-20 border-b bg-orange-50/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-14">
        <p className="text-xs font-semibold tracking-[0.16em] text-orange-700 uppercase">
          Why Goalmaxxing
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Most productivity apps stop at today.
        </h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
          Real goals change week to week. They need room to adapt, a view of what
          comes next, and people who help you keep moving.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {frustrations.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="flex items-start gap-3 rounded-xl border border-orange-200/80 bg-background p-4"
            >
              <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-800">
                <Icon className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-5 rounded-xl border border-blue-200/80 bg-blue-50/70 p-4 text-sm font-medium leading-relaxed text-blue-950">
          Goalmaxxing connects flexible planning, measurable progress, and trusted
          accountability—across today, next week, and the months ahead.
        </p>
      </div>
    </section>
  );
}
