"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchSocialLeaderboards,
  fetchSocialLeaderboardStandings,
} from "@/features/social/data";
import type { LeaderboardSeason, LeaderboardStanding } from "@/features/social/types";

interface StandingsState {
  season: LeaderboardSeason;
  standings: LeaderboardStanding[];
  viewerRank: number | null;
}

export function LeaderboardsPanel() {
  const [seasons, setSeasons] = useState<LeaderboardSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [standings, setStandings] = useState<StandingsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  );

  const loadSeasons = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetchSocialLeaderboards();
      setSeasons(response.items);
      setSelectedSeasonId((current) =>
        current && response.items.some((season) => season.id === current)
          ? current
          : response.items[0]?.id ?? null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load leaderboards.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadStandings = useCallback(async (seasonId: string) => {
    try {
      const response = await fetchSocialLeaderboardStandings(seasonId);
      setStandings({
        season: response.season,
        standings: response.standings,
        viewerRank: response.viewerRank,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load standings."
      );
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSeasons();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSeasons]);

  useEffect(() => {
    if (!selectedSeasonId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadStandings(selectedSeasonId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadStandings, selectedSeasonId]);

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Leaderboards</CardTitle>
          <CardDescription>Loading leaderboard seasons...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Leaderboards unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (seasons.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>No leaderboard seasons</CardTitle>
          <CardDescription>Leaderboard seasons will appear once admins publish one.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Leaderboard seasons</CardTitle>
          <CardDescription>Select an active or recently closed season.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {seasons.map((season) => {
            const selected = season.id === selectedSeasonId;
            return (
              <button
                key={season.id}
                type="button"
                onClick={() => setSelectedSeasonId(season.id)}
                className={`w-full rounded-md border p-3 text-left ${
                  selected ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <p className="font-medium">{season.title}</p>
                <p className="text-xs text-muted-foreground">
                  {season.status} · {season.metric}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{standings?.season.title ?? selectedSeason?.title ?? "Standings"}</CardTitle>
          <CardDescription>
            {standings?.viewerRank
              ? `Your rank: #${standings.viewerRank}`
              : "Your rank will appear once you have a score."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {(standings?.standings ?? []).map((entry) => (
              <div key={entry.subjectId} className="flex items-center justify-between rounded border p-2">
                <div>
                  <p className="font-medium">
                    #{entry.rank} {entry.displayName}
                  </p>
                </div>
                <p className="font-medium">{entry.score}</p>
              </div>
            ))}
            {(standings?.standings ?? []).length === 0 ? (
              <p className="text-muted-foreground">No standings recorded yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
