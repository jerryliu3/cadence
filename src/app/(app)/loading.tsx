function LoadingCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="space-y-3">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full animate-pulse rounded bg-muted" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {title}: {description}
      </p>
    </section>
  );
}

export default function AppRouteLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <LoadingCard
        title="Loading your workspace"
        description="Fetching your latest goals, progress, and collaboration state."
      />
      <LoadingCard
        title="Preparing planner surfaces"
        description="Hydrating interactive controls and calendar views."
      />
    </div>
  );
}
