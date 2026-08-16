"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sendTeamNudge } from "@/features/social/data";

export function NudgeButton({
  partnerId,
  optionalMessage,
  onSent,
}: {
  partnerId: string;
  optionalMessage?: string;
  onSent?: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendNudge() {
    setIsPending(true);
    setError(null);
    try {
      const trimmedOptional = optionalMessage?.trim() ?? "";
      await sendTeamNudge({
        toUserId: partnerId,
        kind: trimmedOptional.length > 0 ? "custom" : "cheer",
        message:
          trimmedOptional.length > 0
            ? `Your partner sent a nudge to keep momentum going. ${trimmedOptional}`
            : undefined,
      });
      onSent?.();
    } catch (nudgeError) {
      setError(nudgeError instanceof Error ? nudgeError.message : "Could not send nudge.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => void sendNudge()}>
        {isPending ? "Sending..." : "Send nudge"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
