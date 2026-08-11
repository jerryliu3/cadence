"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AdminFeedModerationForm() {
  const [eventId, setEventId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (hidden: boolean) => {
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/admin/moderation/feed-events/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden, reason }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        setStatus(body?.message ?? "Moderation request failed.");
      } else {
        setStatus(hidden ? "Feed event hidden." : "Feed event unhidden.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="feed-event-id">Feed event id</Label>
        <Input
          id="feed-event-id"
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
          placeholder="UUID"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="feed-event-reason">Reason (optional)</Label>
        <Textarea
          id="feed-event-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={loading || eventId.trim().length === 0}
          onClick={() => {
            void submit(true);
          }}
        >
          Hide event
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading || eventId.trim().length === 0}
          onClick={() => {
            void submit(false);
          }}
        >
          Unhide event
        </Button>
      </div>
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </div>
  );
}
