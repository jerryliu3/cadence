"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage, postJson } from "@/lib/api/client";
import { invalidatePlannerRelatedTabCaches } from "@/lib/cache/planner-tab-cache";
import { resolveUserTimezone } from "@/lib/dates/timezone";

interface TrainingPlanSessionDraft {
  scheduled_date: string;
  scheduled_time: string | null;
}

interface TrainingPlanGoalDraft {
  title: string;
  description: string;
  category: string;
  category_key: string;
  frequency_type: "recurring" | "fixed_milestones";
  recurrence_interval: "daily" | "weekly" | "monthly" | null;
  target_count: number | null;
  start_date: string;
  end_date: string | null;
  default_local_time: string | null;
  sessions: TrainingPlanSessionDraft[];
}

interface TrainingPlanImportEntryProps {
  onExit?: () => void;
}

export function TrainingPlanImportEntry({ onExit }: TrainingPlanImportEntryProps) {
  const router = useRouter();
  const completeAndExit = useCallback(() => {
    if (onExit) {
      onExit();
      return;
    }
    router.replace("/");
    router.refresh();
  }, [onExit, router]);

  const [planText, setPlanText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [goals, setGoals] = useState<TrainingPlanGoalDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const sessionCount = useMemo(
    () => goals.reduce((total, goal) => total + goal.sessions.length, 0),
    [goals]
  );

  const parsePlan = async () => {
    const trimmed = planText.trim();
    if (!trimmed) {
      toast.error("Paste training-plan text first.");
      return;
    }
    setParsing(true);
    try {
      const payload = await postJson<{
        goals?: TrainingPlanGoalDraft[];
        warnings?: string[];
      }>("/api/training-plan/parse", {
        planText: trimmed,
        timezone: resolveUserTimezone(),
      });
      const nextGoals = payload.goals ?? [];
      if (nextGoals.length === 0) {
        toast.error("No training-plan goals were detected. Add more detail and try again.");
        return;
      }
      setGoals(nextGoals);
      setWarnings(payload.warnings ?? []);
      toast.success(
        `Parsed ${nextGoals.length} goal${nextGoals.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not parse training-plan text."));
    } finally {
      setParsing(false);
    }
  };

  const importPlan = async () => {
    if (goals.length === 0) {
      toast.error("Parse a training plan before importing.");
      return;
    }
    setImporting(true);
    try {
      const payload = await postJson<{
        goalCount: number;
        sessionCount: number;
      }>("/api/training-plan/import", {
        goals,
      });
      invalidatePlannerRelatedTabCaches();
      toast.success(
        `Imported ${payload.goalCount} goal${
          payload.goalCount === 1 ? "" : "s"
        } and ${payload.sessionCount} session${
          payload.sessionCount === 1 ? "" : "s"
        }.`
      );
      completeAndExit();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Training-plan import failed."));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Import training plan</CardTitle>
          <CardDescription>
            Paste plain-text training plans, preview parsed sessions, then import in one
            step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="training-plan-input">Training-plan text</Label>
          <Textarea
            id="training-plan-input"
            value={planText}
            onChange={(event) => setPlanText(event.target.value)}
            maxLength={12000}
            placeholder={
              "Example:\nWeek 1\n2026-09-02 Easy run 45 min at 07:00\n2026-09-04 Tempo run 35 min at 18:00\n2026-09-06 Long run 75 min at 08:00"
            }
            className="min-h-40"
          />
          <Button type="button" variant="outline" onClick={parsePlan} disabled={parsing}>
            {parsing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Parse training plan
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Import preview</CardTitle>
              <CardDescription>
                Confirm parsed goals and dated sessions before import.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{goals.length} goals</Badge>
              <Badge variant="outline">{sessionCount} sessions</Badge>
              <Button
                type="button"
                onClick={importPlan}
                disabled={importing || goals.length === 0}
              >
                {importing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Import training plan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warnings.slice(0, 8).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Parse a training plan to preview imported goals and planner sessions.
            </p>
          ) : (
            goals.map((goal, index) => (
              <div
                key={`${goal.title}-${index}`}
                className="space-y-2 rounded-lg border bg-muted/10 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{goal.title}</span>
                  <Badge variant="outline">{goal.category_key}</Badge>
                  <Badge variant="outline">
                    {goal.frequency_type === "recurring"
                      ? `Recurring · ${goal.recurrence_interval ?? "weekly"}`
                      : `Milestones · ${goal.target_count ?? 0}`}
                  </Badge>
                  <Badge variant="outline">
                    {goal.start_date}
                    {goal.end_date ? ` to ${goal.end_date}` : ""}
                  </Badge>
                  <Badge variant="secondary">
                    {goal.sessions.length} session
                    {goal.sessions.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                {goal.description ? (
                  <p className="text-xs text-muted-foreground">{goal.description}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
