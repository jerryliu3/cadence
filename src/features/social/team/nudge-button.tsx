"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sendTeamNudge } from "@/features/social/data";
import { buildTeamNudgeContent } from "@cadence/shared/social/team";

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
      const content = buildTeamNudgeContent(optionalMessage);
      await sendTeamNudge({
        toUserId: partnerId,
        ...content,
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
