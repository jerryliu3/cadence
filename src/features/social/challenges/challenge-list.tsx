"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchSocialChallengeDetail,
  fetchSocialChallenges,
} from "@/features/social/data";
import { ChallengeDetail } from "@/features/social/challenges/challenge-detail";
import type { SocialChallenge } from "@/features/social/types";

export function ChallengeList() {
  const [items, setItems] = useState<SocialChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SocialChallenge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedChallenge = useMemo(() => {
    if (!selectedId) {
      return null;
    }
    return items.find((item) => item.id === selectedId) ?? null;
  }, [items, selectedId]);
  const selectedDetail = detail && detail.id === selectedId ? detail : null;

  const loadChallenges = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchSocialChallenges();
      setItems(response.items);
      const nextSelectedId =
        selectedId && response.items.some((item) => item.id === selectedId)
          ? selectedId
          : response.items[0]?.id ?? null;
      setSelectedId(nextSelectedId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load challenges.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (challengeId: string) => {
    try {
      const response = await fetchSocialChallengeDetail(challengeId);
      setDetail(response.item);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load challenge.");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadChallenges();
    if (selectedId) {
      await loadDetail(selectedId);
    }
  }, [loadChallenges, loadDetail, selectedId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadChallenges();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadChallenges]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadDetail(selectedId);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadDetail, selectedId]);

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
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
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
                  {item.status} · {item.subjectKind} · {item.viewerProgress ?? 0}/{item.targetValue}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {selectedDetail ?? selectedChallenge ? (
        <ChallengeDetail
          challenge={selectedDetail ?? selectedChallenge!}
          onUpdated={refreshAll}
        />
      ) : null}
    </div>
  );
}
