import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const featureCards = [
  {
    title: "Plan with clarity",
    description:
      "Recurring goals, fixed goals, and tasks in one planner so your week is visible at a glance.",
    icon: CalendarDays,
  },
  {
    title: "Track real progress",
    description:
      "Heatmaps, completion percentages, and streaks help you see consistency instead of guessing.",
    icon: BarChart3,
  },
  {
    title: "Stay accountable",
    description:
      "Social and sharing tools keep momentum high while preserving control over what is visible.",
    icon: Users,
  },
] as const;
const primaryCtaClassName =
  "border-blue-700 bg-blue-700 hover:border-blue-800 hover:bg-blue-800";
const primaryCtaTextStyle = { color: "#ffffff" } as const;

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Goalmaxxing
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
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
              Goal tracking for consistency
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Plan your goals, execute daily, and see real momentum.
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              Goalmaxxing combines planning, daily checklist flow, insights, and social
              accountability in one focused app.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                variant="outline"
                size="lg"
                className={primaryCtaClassName}
                style={primaryCtaTextStyle}
              >
                <Link href="/signup">
                  Create account
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/app">Go to app</Link>
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden border shadow-sm">
            <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500" />
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What your week looks like</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 28 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded-md bg-muted/60 ring-1 ring-border/70"
                  />
                ))}
              </div>
              <div className="space-y-2">
                <div className="h-3 w-4/5 rounded bg-muted" />
                <div className="h-3 w-3/5 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="border-y bg-card/30">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-3">
            {featureCards.map(({ title, description, icon: Icon }) => (
              <Card key={title} className="h-full shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Start simple. Stay consistent.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Build the habit loop first: plan clearly, complete daily, review weekly.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              variant="outline"
              size="lg"
              className={primaryCtaClassName}
              style={primaryCtaTextStyle}
            >
              <Link href="/signup">Create account</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/login">Log in</Link>
            </Button>
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
