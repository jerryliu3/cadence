"use client";

import { formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSocialFreshness } from "@/features/social/data";
import type { SocialFreshness } from "@/features/social/types";
import { cn } from "@/lib/utils";

const SOCIAL_REFRESH_INTERVAL_MS = 60 * 1000;

interface SocialFreshnessIndicatorProps {
  refreshToken?: number;
}

interface FreshnessSnapshot {
  serverNowMs: number;
  nextExpectedRefreshAtMs: number;
  leaderboardRefreshedAtMs: number | null;
  challengesRefreshedAtMs: number | null;
  receivedAtMs: number;
}

function parseTimestamp(timestamp: string | null): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSnapshot(freshness: SocialFreshness): FreshnessSnapshot {
  const fallbackNow = Date.now();
  const parsedServerNow = Date.parse(freshness.serverNow);
  const serverNowMs = Number.isFinite(parsedServerNow) ? parsedServerNow : fallbackNow;
  const parsedNextExpected = Date.parse(freshness.nextExpectedRefreshAt);
  const nextExpectedRefreshAtMs = Number.isFinite(parsedNextExpected)
    ? parsedNextExpected
    : serverNowMs + SOCIAL_REFRESH_INTERVAL_MS;

  return {
    serverNowMs,
    nextExpectedRefreshAtMs,
    leaderboardRefreshedAtMs: parseTimestamp(freshness.leaderboardRefreshedAt),
    challengesRefreshedAtMs: parseTimestamp(freshness.challengesRefreshedAt),
    receivedAtMs: fallbackNow,
  };
}

function formatRelative(timestampMs: number | null) {
  if (timestampMs === null) {
    return "awaiting first run";
  }
  return formatDistanceToNow(new Date(timestampMs), { addSuffix: true });
}

function combineStandingsAndChallengesFreshness({
  leaderboardRefreshedAtMs,
  challengesRefreshedAtMs,
}: {
  leaderboardRefreshedAtMs: number | null;
  challengesRefreshedAtMs: number | null;
}) {
  const timestamps = [leaderboardRefreshedAtMs, challengesRefreshedAtMs].filter(
    (timestamp): timestamp is number => timestamp !== null
  );
  if (timestamps.length === 0) {
    return null;
  }
  // Use the older timestamp so the single signal is safe for both datasets.
  return Math.min(...timestamps);
}

export function SocialFreshnessIndicator({
  refreshToken = 0,
}: SocialFreshnessIndicatorProps) {
  const [snapshot, setSnapshot] = useState<FreshnessSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientNowMs, setClientNowMs] = useState(() => Date.now());

  const loadFreshness = useCallback(async () => {
    try {
      setErrorMessage(null);
      const response = await fetchSocialFreshness();
      setSnapshot(toSnapshot(response.freshness));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Freshness signal unavailable."
      );
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadFreshness();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadFreshness, refreshToken]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClientNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const secondsUntilNextRefresh = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    const elapsedMs = Math.max(0, clientNowMs - snapshot.receivedAtMs);
    const estimatedServerNowMs = snapshot.serverNowMs + elapsedMs;
    return Math.max(
      0,
      Math.ceil(
        (snapshot.nextExpectedRefreshAtMs - estimatedServerNowMs) / 1000
      )
    );
  }, [clientNowMs, snapshot]);

  const standingsAndChallengesRefreshedAt = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    return combineStandingsAndChallengesFreshness({
      leaderboardRefreshedAtMs: snapshot.leaderboardRefreshedAtMs,
      challengesRefreshedAtMs: snapshot.challengesRefreshedAtMs,
    });
  }, [snapshot]);

  const indicatorClassName = useMemo(
    () =>
      cn(
        "inline-block size-2 rounded-full",
        errorMessage
          ? "bg-destructive"
          : snapshot
            ? "animate-pulse bg-emerald-500"
            : "bg-muted-foreground/40"
      ),
    [errorMessage, snapshot]
  );

  if (!snapshot) {
    return (
      <p
        className="flex items-center gap-2 text-xs text-muted-foreground"
        data-testid="social-freshness-indicator"
      >
        <span
          aria-hidden
          className={indicatorClassName}
          data-testid="social-freshness-status-dot"
        />
        Community syncs every minute.
        {errorMessage ? " Freshness details are temporarily unavailable." : ""}
      </p>
    );
  }

  return (
    <p
      className="flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="social-freshness-indicator"
    >
      <span
        aria-hidden
        className={indicatorClassName}
        data-testid="social-freshness-status-dot"
      />
      Sync every 1m
      {` · next run in ${secondsUntilNextRefresh ?? 0}s`}
      {` · standings + challenges ${formatRelative(standingsAndChallengesRefreshedAt)}`}
      {errorMessage ? " · refresh signal unavailable" : ""}
    </p>
  );
}
