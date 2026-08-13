"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SocialChallenge } from "@/features/social/types";

interface AdminChallengeResponse {
  schemaVersion: "1";
  items?: SocialChallenge[];
}

export function AdminChallengesManager() {
  const [items, setItems] = useState<SocialChallenge[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/admin/challenges", {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(payload.message ?? "Could not load admin challenges.");
    }
    const payload = (await response.json()) as AdminChallengeResponse;
    setItems(payload.items ?? []);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load().catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load challenges.");
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function createDraft() {
    setError(null);
    setIsPending(true);
    try {
      const now = new Date();
      const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const response = await fetch("/api/admin/challenges", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          title,
          status: "draft",
          subjectKind: "user",
          metric: "completions_count",
          targetValue: 5,
          startsAt: now.toISOString(),
          endsAt: endsAt.toISOString(),
          rewardXp: 0,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Could not create challenge.");
      }
      setSlug("");
      setTitle("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create challenge.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Create draft challenge</CardTitle>
          <CardDescription>
            Minimal admin surface for creating and reviewing challenge rows during rollout.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Challenge title"
          />
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="challenge-slug"
          />
          <Button
            type="button"
            disabled={isPending || title.trim().length === 0 || slug.trim().length < 2}
            onClick={() => void createDraft()}
          >
            Create draft
          </Button>
          {error ? <p className="text-xs text-destructive md:col-span-2">{error}</p> : null}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Challenge rows</CardTitle>
          <CardDescription>Current challenge catalog across statuses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {items.length === 0 ? (
            <p className="text-muted-foreground">No challenges found.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded border p-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.slug} · {item.status} · {item.metric} · {item.audienceKind}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
