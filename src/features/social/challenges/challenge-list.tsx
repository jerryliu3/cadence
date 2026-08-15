"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSocialChallenges } from "@/features/social/data";
import { ChallengeDetail } from "@/features/social/challenges/challenge-detail";
import type { SocialChallenge } from "@/features/social/types";

export function ChallengeList() {
  const [items, setItems] = useState<SocialChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedChallenge = useMemo(() => {
    if (!selectedId) {
      return null;
    }
    return items.find((item) => item.id === selectedId) ?? null;
  }, [items, selectedId]);

  const loadChallenges = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchSocialChallenges();
      setItems(response.items);
      setSelectedId((previousSelectedId) => {
        if (
          previousSelectedId &&
          response.items.some((item) => item.id === previousSelectedId)
        ) {
          return previousSelectedId;
        }
        return response.items[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load challenges.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadChallenges();
  }, [loadChallenges]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadChallenges();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadChallenges]);

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Challenges</CardTitle>
          <CardDescription>Loading challenge roster...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Challenges unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>No active challenges</CardTitle>
          <CardDescription>New challenges will appear here when published.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Challenges</CardTitle>
          <CardDescription>Select a challenge to view details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.status} · {item.subjectKind}
                  {item.audienceKind === "cohort" ? " · group" : ""} · {item.viewerProgress ?? 0}/
                  {item.targetValue}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {selectedChallenge ? <ChallengeDetail challenge={selectedChallenge} onUpdated={refreshAll} /> : null}
    </div>
  );
}
