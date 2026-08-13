"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  acceptSocialTeamInvite,
  createSocialTeamInvite,
  declineSocialTeamInvite,
  dissolveSocialTeam,
  fetchSocialTeamState,
} from "@/features/social/data";
import type { TeamStateRow } from "@/features/social/types";
import { NudgeButton } from "@/features/social/team/nudge-button";
import { PartnerPlan } from "@/features/social/team/partner-plan";

export function TeamPanel() {
  const [rows, setRows] = useState<TeamStateRow[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeTeam = useMemo(
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
      const response = await fetchSocialTeamState();
      setRows(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load team state.");
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
      await createSocialTeamInvite({ partnerId, message });
      setPartnerId("");
      setMessage("");
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not send invite.");
    }
  }

  async function acceptInvite(teamId: string) {
    setError(null);
    try {
      await acceptSocialTeamInvite(teamId);
      await load();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept invite.");
    }
  }

  async function declineInvite(teamId: string) {
    setError(null);
    try {
      await declineSocialTeamInvite(teamId);
      await load();
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Could not decline invite.");
    }
  }

  async function dissolveActiveTeam() {
    setError(null);
    try {
      await dissolveSocialTeam();
      await load();
    } catch (dissolveError) {
      setError(dissolveError instanceof Error ? dissolveError.message : "Could not dissolve team.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Team invites</CardTitle>
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

      {activeTeam ? <PartnerPlan partnerId={activeTeam.partnerId} /> : null}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Current team</CardTitle>
          <CardDescription>
            {activeTeam
              ? `Active with ${activeTeam.partnerDisplayName ?? activeTeam.partnerUsername ?? "partner"}`
              : "No active team"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeTeam ? (
            <div className="flex flex-wrap items-center gap-2">
              <NudgeButton
                partnerId={activeTeam.partnerId}
                onSent={() => {
                  void load();
                }}
              />
              <Button type="button" variant="outline" onClick={() => void dissolveActiveTeam()}>
                Dissolve team
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Accept an invite to activate team features.</p>
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
              <div key={invite.teamId} className="rounded border p-3">
                <p className="font-medium">
                  {invite.partnerDisplayName ?? invite.partnerUsername ?? invite.partnerId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {invite.isIncoming ? "Incoming" : "Outgoing"}
                </p>
                {invite.isIncoming ? (
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" onClick={() => void acceptInvite(invite.teamId)}>
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void declineInvite(invite.teamId)}
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
