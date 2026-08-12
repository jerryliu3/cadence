"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SeasonRow {
  id: string;
  slug: string;
  title: string;
  status: "upcoming" | "open" | "closed";
  metric: string;
  starts_at: string;
  ends_at: string | null;
}

export function AdminSeasonsManager() {
  const [items, setItems] = useState<SeasonRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/admin/seasons", {
            cache: "no-store",
            credentials: "include",
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { message?: string };
            throw new Error(payload.message ?? "Could not load seasons.");
          }
          const payload = (await response.json()) as { items?: SeasonRow[] };
          setItems(payload.items ?? []);
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : "Could not load seasons.");
        }
      })();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Season rows</CardTitle>
        <CardDescription>Inspect configured leaderboard seasons.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {error ? <p className="text-destructive">{error}</p> : null}
        {items.length === 0 ? (
          <p className="text-muted-foreground">No seasons found.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded border p-3">
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.slug} · {item.status} · {item.metric}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
