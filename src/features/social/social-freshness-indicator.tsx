"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSocialFreshness } from "@/features/social/data";
import type { SocialFreshness } from "@/features/social/types";
import { cn } from "@/lib/utils";

const SOCIAL_REFRESH_INTERVAL_MS = 60 * 1000;

interface SocialFreshnessIndicatorProps {
  refreshToken?: number;
  onRefreshRequested?: () => void;
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

export function SocialFreshnessIndicator({
  refreshToken = 0,
  onRefreshRequested,
}: SocialFreshnessIndicatorProps) {
  const [snapshot, setSnapshot] = useState<FreshnessSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientNowMs, setClientNowMs] = useState(() => Date.now());
  const refreshInFlightRef = useRef(false);
  const lastElapsedRefreshAtRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!snapshot || secondsUntilNextRefresh === null || secondsUntilNextRefresh > 0) {
      return;
    }
    if (
      refreshInFlightRef.current ||
      lastElapsedRefreshAtRef.current === snapshot.nextExpectedRefreshAtMs
    ) {
      return;
    }
    lastElapsedRefreshAtRef.current = snapshot.nextExpectedRefreshAtMs;
    refreshInFlightRef.current = true;
    onRefreshRequested?.();
    void loadFreshness().finally(() => {
      refreshInFlightRef.current = false;
    });
  }, [loadFreshness, onRefreshRequested, secondsUntilNextRefresh, snapshot]);

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
        Sync every minute.
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
      {`Sync every minute (${secondsUntilNextRefresh ?? 0}s)`}
      {errorMessage ? " · refresh signal unavailable" : ""}
    </p>
  );
}
