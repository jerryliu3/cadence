export default function InsightsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-lg border bg-card" />
      <div className="h-64 w-full animate-pulse rounded-lg border bg-card" />
    </div>
  );
}
