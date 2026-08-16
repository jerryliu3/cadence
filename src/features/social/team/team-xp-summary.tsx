export function TeamXpSummary({ totalXp }: { totalXp: number }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="text-xs font-medium text-muted-foreground">Team XP</p>
      <p className="text-xl font-semibold">{totalXp.toLocaleString()} XP</p>
      <p className="text-xs text-muted-foreground">
        Earned together since the team formed
      </p>
    </div>
  );
}
