"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  acceptSocialDuoInvite,
  createSocialDuoInvite,
  declineSocialDuoInvite,
  dissolveSocialDuo,
  fetchSocialDuoState,
} from "@/features/social/data";
import type { DuoStateRow } from "@/features/social/types";

export function DuoPanel() {
  const [rows, setRows] = useState<DuoStateRow[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeDuo = useMemo(
    () => rows.find((row) => row.status === "active") ?? null,
    [rows]
  );
  const pendingInvites = useMemo(
    () => rows.filter((row) => row.status === "pending"),
    [rows]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetchSocialDuoState();
      setRows(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load duo state.");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function sendInvite() {
    setError(null);
    try {
      await createSocialDuoInvite({ partnerId, message });
      setPartnerId("");
      setMessage("");
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not send invite.");
    }
  }

  async function acceptInvite(duoId: string) {
    setError(null);
    try {
      await acceptSocialDuoInvite(duoId);
      await load();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept invite.");
    }
  }

  async function declineInvite(duoId: string) {
    setError(null);
    try {
      await declineSocialDuoInvite(duoId);
      await load();
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Could not decline invite.");
    }
  }

  async function dissolveActiveDuo() {
    setError(null);
    try {
      await dissolveSocialDuo();
      await load();
    } catch (dissolveError) {
      setError(dissolveError instanceof Error ? dissolveError.message : "Could not dissolve duo.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Duo invites</CardTitle>
          <CardDescription>
            Send an invite by partner id while rollout routes are dark-launched.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Input
            value={partnerId}
            onChange={(event) => setPartnerId(event.target.value)}
            placeholder="Partner user id"
          />
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Invite message (optional)"
          />
          <Button
            type="button"
            onClick={() => void sendInvite()}
            disabled={partnerId.trim().length < 10}
          >
            Send invite
          </Button>
          {error ? <p className="text-xs text-destructive md:col-span-3">{error}</p> : null}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Current duo</CardTitle>
          <CardDescription>
            {activeDuo
              ? `Active with ${activeDuo.partnerDisplayName ?? activeDuo.partnerUsername ?? "partner"}`
              : "No active duo"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeDuo ? (
            <Button type="button" variant="outline" onClick={() => void dissolveActiveDuo()}>
              Dissolve duo
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Accept an invite to activate duo features.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {pendingInvites.length === 0 ? (
            <p className="text-muted-foreground">No pending invites.</p>
          ) : (
            pendingInvites.map((invite) => (
              <div key={invite.duoId} className="rounded border p-3">
                <p className="font-medium">
                  {invite.partnerDisplayName ?? invite.partnerUsername ?? invite.partnerId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {invite.isIncoming ? "Incoming" : "Outgoing"}
                </p>
                {invite.isIncoming ? (
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" onClick={() => void acceptInvite(invite.duoId)}>
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void declineInvite(invite.duoId)}
                    >
                      Decline
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
