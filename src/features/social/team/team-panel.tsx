"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  acceptSocialTeamInvite,
  createSocialTeamInvite,
  declineSocialTeamInvite,
  dissolveSocialTeam,
  fetchSocialTeamState,
} from "@/features/social/data";
import {
  TEAM_NUDGE_USER_TEXT_MAX_LENGTH,
  type TeamStateRow,
} from "@cadence/shared/social/team";
import { NudgeButton } from "@/features/social/team/nudge-button";
import { TeamXpSummary } from "@/features/social/team/team-xp-summary";

export function TeamPanel() {
  const router = useRouter();
  const [rows, setRows] = useState<TeamStateRow[]>([]);
  const [partnerUsername, setPartnerUsername] = useState("");
  const [message, setMessage] = useState("");
  const [nudgeMessage, setNudgeMessage] = useState("");
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
      await createSocialTeamInvite({ partnerUsername, message });
      setPartnerUsername("");
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
      router.refresh();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept invite.");
    }
  }

  async function declineInvite(teamId: string) {
    setError(null);
    try {
      await declineSocialTeamInvite(teamId);
      await load();
      router.refresh();
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Could not decline invite.");
    }
  }

  async function dissolveActiveTeam() {
    const confirmed = window.confirm(
      "Leave team? You and your partner will no longer share duo progress until a new team is active."
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await dissolveSocialTeam();
      await load();
      router.refresh();
    } catch (dissolveError) {
      setError(dissolveError instanceof Error ? dissolveError.message : "Could not leave team.");
    }
  }

  return (
    <div className="space-y-4">
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
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded border border-border bg-muted/20 px-3 py-3">
                <UserAvatar
                  avatarUrl={activeTeam.partnerAvatarUrl}
                  displayName={activeTeam.partnerDisplayName}
                  username={activeTeam.partnerUsername}
                  size="sm"
                  alt="Partner avatar"
                />
                <div className="min-w-0">
                  <p className="truncate text-xl font-medium">
                    {activeTeam.partnerDisplayName ??
                      activeTeam.partnerUsername ??
                      "Partner"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    Team partner
                  </p>
                </div>
              </div>
              <TeamXpSummary totalXp={activeTeam.teamXp ?? 0} />
              <Input
                value={nudgeMessage}
                onChange={(event) => setNudgeMessage(event.target.value)}
                placeholder="Optional nudge message"
                maxLength={TEAM_NUDGE_USER_TEXT_MAX_LENGTH}
              />
              <NudgeButton
                partnerId={activeTeam.partnerId}
                optionalMessage={nudgeMessage}
                onSent={() => {
                  void load();
                }}
              />
              <Button type="button" variant="destructive" onClick={() => void dissolveActiveTeam()}>
                Leave team
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Accept an invite to activate team features.</p>
          )}
        </CardContent>
      </Card>

      {!activeTeam ? (
        <>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Team invites</CardTitle>
              <CardDescription>
                Send an invite by partner username while rollout routes are dark-launched.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              <Input
                value={partnerUsername}
                onChange={(event) => setPartnerUsername(event.target.value)}
                placeholder="Partner username"
              />
              <Input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Invite message (optional)"
              />
              <Button
                type="button"
                onClick={() => void sendInvite()}
                disabled={partnerUsername.trim().replace(/^@/, "").length < 3}
              >
                Send invite
              </Button>
              {error ? <p className="text-xs text-destructive md:col-span-3">{error}</p> : null}
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
        </>
      ) : null}
      {activeTeam && error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
