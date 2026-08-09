"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  acceptTeamPlannerProposal,
  fetchTeamPartnerPlan,
  fetchTeamPlannerProposals,
  rejectTeamPlannerProposal,
  withdrawTeamPlannerProposal,
} from "@/features/social/data";
import { PlannerProposalForm } from "@/features/social/team/planner-proposal-form";
import type { TeamPartnerPlanItem, TeamPlannerProposal } from "@/features/social/types";

function getCurrentScopeMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PartnerPlan({ partnerId }: { partnerId: string }) {
  const [scopeMonth] = useState(getCurrentScopeMonth());
  const [items, setItems] = useState<TeamPartnerPlanItem[]>([]);
  const [proposals, setProposals] = useState<TeamPlannerProposal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [plan, proposalResponse] = await Promise.all([
        fetchTeamPartnerPlan(scopeMonth),
        fetchTeamPlannerProposals(scopeMonth),
      ]);
      setItems(plan.items);
      setProposals(proposalResponse.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load partner planner data.");
    }
  }, [scopeMonth]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const pendingIncoming = useMemo(
    () =>
      proposals.filter(
        (proposal) => proposal.status === "pending" && proposal.targetOwnerId !== partnerId
      ),
    [partnerId, proposals]
  );
  const pendingOutgoing = useMemo(
    () =>
      proposals.filter(
        (proposal) => proposal.status === "pending" && proposal.targetOwnerId === partnerId
      ),
    [partnerId, proposals]
  );

  async function handleAccept(proposalId: string) {
    try {
      await acceptTeamPlannerProposal(proposalId);
      await load();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept proposal.");
    }
  }

  async function handleReject(proposalId: string) {
    try {
      await rejectTeamPlannerProposal(proposalId);
      await load();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "Could not reject proposal.");
    }
  }

  async function handleWithdraw(proposalId: string) {
    try {
      await withdrawTeamPlannerProposal(proposalId);
      await load();
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "Could not withdraw proposal.");
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Partner planner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Scope month: {scopeMonth}</p>
        {items.length === 0 ? (
          <p className="text-muted-foreground">No shared partner planner items for this month.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.itemId} className="rounded border p-2">
                <p className="font-medium">{item.goalTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {item.scheduledDate}
                  {item.scheduledTime ? ` @ ${item.scheduledTime}` : ""} · {item.unitKey}
                  {item.locked ? " · locked" : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        <PlannerProposalForm
          partnerId={partnerId}
          scopeMonth={scopeMonth}
          items={items}
          onSubmitted={load}
        />

        <div className="space-y-2">
          <p className="font-medium">Pending proposals for you</p>
          {pendingIncoming.length === 0 ? (
            <p className="text-muted-foreground">No pending proposals to review.</p>
          ) : (
            pendingIncoming.map((proposal) => (
              <div key={proposal.id} className="rounded border p-2">
                <p className="text-xs text-muted-foreground">{proposal.createdAt}</p>
                {proposal.note ? <p>{proposal.note}</p> : null}
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={() => void handleAccept(proposal.id)}>
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleReject(proposal.id)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="font-medium">Your pending proposals</p>
          {pendingOutgoing.length === 0 ? (
            <p className="text-muted-foreground">No outgoing pending proposals.</p>
          ) : (
            pendingOutgoing.map((proposal) => (
              <div key={proposal.id} className="rounded border p-2">
                <p className="text-xs text-muted-foreground">{proposal.createdAt}</p>
                {proposal.note ? <p>{proposal.note}</p> : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void handleWithdraw(proposal.id)}
                >
                  Withdraw
                </Button>
              </div>
            ))
          )}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
