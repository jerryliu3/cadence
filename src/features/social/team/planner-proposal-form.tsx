"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTeamPlannerProposal } from "@/features/social/data";
import type { TeamPartnerPlanItem } from "@/features/social/types";

type ProposalMode = "move_item" | "lock_item" | "clear_month";

export function PlannerProposalForm({
  partnerId,
  scopeMonth,
  items,
  onSubmitted,
}: {
  partnerId: string;
  scopeMonth: string;
  items: TeamPartnerPlanItem[];
  onSubmitted: () => Promise<void>;
}) {
  const [mode, setMode] = useState<ProposalMode>("move_item");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("");
  const [lockValue, setLockValue] = useState("true");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => `${item.goalId}::${item.unitKey}` === selectedKey) ?? null,
    [items, selectedKey]
  );

  async function submitProposal() {
    setPending(true);
    setError(null);
    try {
      let operations: Array<Record<string, unknown>>;
      if (mode === "clear_month") {
        operations = [{ op: "clear_month" }];
      } else {
        if (!selectedItem) {
          throw new Error("Select a partner planner item first.");
        }
        if (mode === "move_item") {
          if (!toDate) {
            throw new Error("Provide a destination date.");
          }
          operations = [
            {
              op: "move_item",
              goalId: selectedItem.goalId,
              unitKey: selectedItem.unitKey,
              toDate,
              ...(toTime ? { toTime } : {}),
            },
          ];
        } else {
          operations = [
            {
              op: "lock_item",
              goalId: selectedItem.goalId,
              unitKey: selectedItem.unitKey,
              locked: lockValue === "true",
            },
          ];
        }
      }

      await createTeamPlannerProposal({
        targetOwnerId: partnerId,
        scopeMonth,
        operations,
        note: note.trim() || undefined,
      });
      setNote("");
      setToDate("");
      setToTime("");
      await onSubmitted();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create proposal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded border p-3">
      <p className="text-sm font-medium">Create planner proposal</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Operation</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as ProposalMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="move_item">Move item</SelectItem>
              <SelectItem value="lock_item">Toggle lock</SelectItem>
              <SelectItem value="clear_month">Clear month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode !== "clear_month" ? (
          <div className="space-y-1">
            <Label>Planner item</Label>
            <Select value={selectedKey} onValueChange={setSelectedKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => {
                  const key = `${item.goalId}::${item.unitKey}`;
                  return (
                    <SelectItem key={key} value={key}>
                      {item.goalTitle} · {item.scheduledDate}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {mode === "move_item" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label>New date</Label>
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>New time (optional)</Label>
            <Input
              type="time"
              value={toTime}
              onChange={(event) => setToTime(event.target.value)}
              step={60}
            />
          </div>
        </div>
      ) : null}

      {mode === "lock_item" ? (
        <div className="space-y-1">
          <Label>Locked value</Label>
          <Select value={lockValue} onValueChange={setLockValue}>
            <SelectTrigger className="max-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Locked</SelectItem>
              <SelectItem value="false">Unlocked</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label>Note (optional)</Label>
        <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      </div>

      <Button type="button" onClick={() => void submitProposal()} disabled={pending}>
        {pending ? "Submitting..." : "Submit proposal"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
