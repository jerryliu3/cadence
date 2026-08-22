"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SocialFreshnessIndicator } from "@/features/social/social-freshness-indicator";
import { fetchSocialChallenges } from "@/features/social/data";
import { ChallengeDetail } from "@/features/social/challenges/challenge-detail";
import type { SocialChallenge } from "@/features/social/types";

interface ChallengeListProps {
  isActive?: boolean;
  refreshToken?: number;
  onRefreshRequested?: () => void;
}

export function ChallengeList({
  isActive = true,
  refreshToken = 0,
  onRefreshRequested,
}: ChallengeListProps) {
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
    if (!isActive) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadChallenges();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isActive, loadChallenges, refreshToken]);

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="space-y-2">
          <SocialFreshnessIndicator
            refreshToken={refreshToken}
            onRefreshRequested={onRefreshRequested}
          />
          <CardTitle>Challenges</CardTitle>
          <CardDescription>Loading challenge roster...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="space-y-2">
          <SocialFreshnessIndicator
            refreshToken={refreshToken}
            onRefreshRequested={onRefreshRequested}
          />
          <CardTitle>Challenges</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="space-y-2">
          <SocialFreshnessIndicator
            refreshToken={refreshToken}
            onRefreshRequested={onRefreshRequested}
          />
          <CardTitle>Challenges</CardTitle>
          <CardDescription>New challenges will appear here when published.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="shadow-sm">
        <CardHeader className="space-y-2">
          <SocialFreshnessIndicator
            refreshToken={refreshToken}
            onRefreshRequested={onRefreshRequested}
          />
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
                className={`w-full rounded-md border bg-card p-3 text-left transition-[transform,box-shadow,border-color,background-color] duration-150 hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[inset_0_2px_5px_rgba(15,23,42,0.22)] ${
                  isSelected
                    ? "translate-y-[3px] cursor-default border-primary bg-primary/5 shadow-[inset_0_2px_5px_rgba(15,23,42,0.22)] hover:translate-y-[3px]"
                    : "border-border shadow-[0_3px_0_rgba(15,23,42,0.14)]"
                }`}
              >
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.status} · {item.subjectKind}
                  {item.audienceKind === "group" ? " · group" : ""} · {item.viewerProgress ?? 0}/
                  {item.targetValue}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {selectedChallenge ? (
        <ChallengeDetail challenge={selectedChallenge} onUpdated={refreshAll} />
      ) : (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Challenge details</CardTitle>
            <CardDescription>Select a challenge to view details.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
