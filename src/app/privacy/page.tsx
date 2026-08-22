export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Goalmaxxing stores account details, goal data, and activity history to provide
        planning, progress tracking, and social accountability features.
      </p>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">What we store</h2>
        <p className="text-sm text-muted-foreground">
          We store your account identifiers, profile settings, goals, completions,
          planner state, and optional push notification subscriptions.
        </p>
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">How it is used</h2>
        <p className="text-sm text-muted-foreground">
          Data is used to render your planner, calculate streaks and stats, and deliver
          features you explicitly enable, such as notifications or social views.
        </p>
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-sm text-muted-foreground">
          For privacy questions, use the in-app support/report channel in your profile
          settings.
        </p>
      </section>
    </main>
  );
}
