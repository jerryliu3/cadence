"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { joinSocialGroup } from "@/features/social/data";

export function CohortJoinCard() {
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleJoin() {
    setIsPending(true);
    setError(null);
    setMessage(null);
    try {
      await joinSocialGroup(joinCode);
      setMessage("Joined the group.");
      setJoinCode("");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join group.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Join a group</CardTitle>
        <CardDescription>
          Groups are private spaces that scope challenges and leaderboards. Enter a join code from your organizer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value)}
          placeholder="Join code"
        />
        <Button
          type="button"
          disabled={isPending || joinCode.trim().length === 0}
          onClick={() => void handleJoin()}
        >
          Join
        </Button>
        {error ? <p className="text-xs text-destructive md:col-span-2">{error}</p> : null}
        {message ? <p className="text-xs text-muted-foreground md:col-span-2">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
