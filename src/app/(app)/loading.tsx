export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded-2xl border border-border/70 bg-card/60" />
        <div className="h-10 rounded-xl border border-border/70 bg-card/60" />
        <div className="h-72 rounded-2xl border border-border/70 bg-card/60" />
      </div>
    </div>
  );
}
