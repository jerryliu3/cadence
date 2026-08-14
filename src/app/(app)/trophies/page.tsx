"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface TrophyPayload {
  achievedGoals: Array<{
    goalId: string;
    title: string;
    rewardText: string | null;
    achievedOn: string | null;
  }>;
  systemAwards: Array<{
    id: string;
    title: string | null;
    level: number | null;
    unlockedAt: string;
    revokedAt: string | null;
  }>;
  personalRewards: Array<{
    id: string;
    title: string;
    note: string | null;
    unlockTotalXp: number;
    unlockedAt: string | null;
    claimedAt: string | null;
  }>;
  truncated: {
    goals: boolean;
    completions: boolean;
    levelHistory: boolean;
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

export default function TrophiesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<TrophyPayload | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [unlockTotalXp, setUnlockTotalXp] = useState("1000");
  const [saving, setSaving] = useState(false);

  const loadTrophies = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/xp/trophies", {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
      });
      if (!response.ok) {
        throw new Error("Trophies could not be loaded.");
      }
      const body = (await response.json()) as TrophyPayload & { correlationId: string };
      setPayload(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Trophies could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTrophies();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadTrophies]);

  const pendingRewards = useMemo(
    () => payload?.personalRewards.filter((reward) => !reward.claimedAt) ?? [],
    [payload]
  );
  const claimedRewards = useMemo(
    () => payload?.personalRewards.filter((reward) => Boolean(reward.claimedAt)) ?? [],
    [payload]
  );

  async function createReward() {
    const unlockXp = Number.parseInt(unlockTotalXp, 10);
    if (!title.trim()) {
      toast.error("Enter a reward title.");
      return;
    }
    if (!Number.isFinite(unlockXp) || unlockXp <= 0) {
      toast.error("Enter a valid unlock XP threshold.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/xp/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim() || undefined,
          unlockTotalXp: unlockXp,
        }),
      });
      if (!response.ok) {
        throw new Error("Reward could not be created.");
      }
      setTitle("");
      setNote("");
      setUnlockTotalXp("1000");
      await loadTrophies();
      toast.success("Reward created.");
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "Reward could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function claimReward(rewardId: string) {
    try {
      const response = await fetch(`/api/xp/rewards/${rewardId}/claim`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Reward could not be claimed.");
      }
      await loadTrophies();
      toast.success("Reward claimed.");
    } catch (claimError) {
      toast.error(claimError instanceof Error ? claimError.message : "Reward could not be claimed.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Trophy Case</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Loading trophies…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Trophy Case</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive">
            {error ?? "Trophies could not be loaded."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Trophy Case</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {payload.truncated.goals || payload.truncated.completions ? (
            <p className="text-muted-foreground">
              Showing a bounded trophy snapshot for this account.
            </p>
          ) : null}
          <div className="space-y-2">
            <h3 className="font-medium">Achieved Goals</h3>
            {payload.achievedGoals.length === 0 ? (
              <p className="text-muted-foreground">No achieved goals yet.</p>
            ) : (
              payload.achievedGoals.slice(0, 20).map((goal) => (
                <div key={goal.goalId} className="rounded-md border p-2">
                  <p className="font-medium">{goal.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Achieved {formatDate(goal.achievedOn)}
                  </p>
                  {goal.rewardText ? (
                    <p className="mt-1 text-xs">{goal.rewardText}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Rewards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Reward title (e.g. New bike)"
              maxLength={120}
            />
            <Input
              value={unlockTotalXp}
              onChange={(event) => setUnlockTotalXp(event.target.value)}
              placeholder="Unlock at XP"
              inputMode="numeric"
            />
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
              maxLength={500}
            />
            <Button type="button" onClick={createReward} disabled={saving}>
              Add reward
            </Button>
          </div>

          <div className="space-y-2">
            {pendingRewards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active personal rewards.</p>
            ) : (
              pendingRewards.map((reward) => (
                <div key={reward.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{reward.title}</p>
                    {reward.unlockedAt ? (
                      <Badge>Unlocked</Badge>
                    ) : (
                      <Badge variant="secondary">{`Unlocks at ${reward.unlockTotalXp} XP`}</Badge>
                    )}
                  </div>
                  {reward.note ? <p className="mt-1 text-xs text-muted-foreground">{reward.note}</p> : null}
                  {reward.unlockedAt ? (
                    <Button
                      className="mt-2"
                      type="button"
                      size="sm"
                      onClick={() => void claimReward(reward.id)}
                    >
                      Mark claimed
                    </Button>
                  ) : null}
                </div>
              ))
            )}
            {claimedRewards.length > 0 ? (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-medium">Claimed</h3>
                {claimedRewards.map((reward) => (
                  <div key={reward.id} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{reward.title}</p>
                      <Badge variant="secondary">Claimed</Badge>
                    </div>
                    {reward.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{reward.note}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Claimed {formatDate(reward.claimedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Awards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {payload.systemAwards.length === 0 ? (
            <p className="text-muted-foreground">No system awards yet.</p>
          ) : (
            payload.systemAwards.slice(0, 20).map((award) => (
              <div key={award.id} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <p className="font-medium">{award.title ?? "XP award"}</p>
                  <p className="text-xs text-muted-foreground">
                    Level {award.level ?? "?"} · {formatDate(award.unlockedAt)}
                  </p>
                </div>
                {award.revokedAt ? <Badge variant="secondary">Revoked</Badge> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
