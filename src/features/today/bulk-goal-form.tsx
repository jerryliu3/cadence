"use client";

import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingCard } from "@/components/ui/loading-card";
import { Textarea } from "@/components/ui/textarea";
import { TooltipIcon } from "@/components/ui/tooltip-icon";
import {
  type BulkGoalDraft,
  type LlmGoalDraftPayload,
  buildBulkGoalDraftFromRow,
  buildBulkGoalDraftsFromLlmGoals,
  bulkGoalDraftRequiresEndDate,
  normalizeBulkGoalLocalTime,
  parseBulkGoalTargetCount,
  prepareBulkGoalRows,
  withValidatedBulkGoalDraft,
} from "@/features/goals/bulk-goal-drafts";
import {
  CategorySelect,
  GoalTypeToggle,
  RecurrenceIntervalToggle,
  TargetCountField,
} from "@/features/goals/goal-field-kit";
import { GoalLinkTargetSelect } from "@/features/goals/goal-link-target-select";
import { MilestoneNameFields } from "@/features/goals/milestone-name-fields";
import {
  GoalDateRangeFields,
  GoalDefaultTimeField,
} from "@/features/goals/goal-schedule-fields";
import { BulkGoalInputCard } from "@/features/today/bulk-goal-input-card";
import { type BulkInputMode } from "@/features/today/bulk-goal-types";
import { getApiErrorMessage, postJson } from "@/lib/api/client";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import { invalidatePlannerRelatedTabCaches } from "@/lib/cache/planner-tab-cache";
import { toLocalDateString } from "@/lib/dates/day";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import {
  type CategorySelection,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import {
  fetchProgressContext,
  progressSummaryMap,
} from "@/lib/goals/progress-context";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
} from "@/lib/goals/linked-goal-labels";
import { buildMilestoneNameDrafts } from "@/lib/goals/milestones";
import type { Goal } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface BulkGoalFormProps {
  showBackButton?: boolean;
  modeSwitchControl?: ReactNode;
  onExit?: () => void;
}

const csvExample = `title,description,category,color,frequency_type,recurrence_interval,target_count,milestone_names,start_date,end_date,default_local_time
Morning run,Train for a half marathon,Health,#16a34a,recurring,daily,20,,2026-06-01,2026-12-31,06:45
Read 12 books,One book per month,Personal,#6366f1,fixed,,12,Book 1|Book 2|Book 3,2026-06-01,2026-12-31,`;

async function parseRowsFromCsvText(csvText: string): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(csvText, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
}

async function parseRowsFromSpreadsheetFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
}

export function BulkGoalForm({
  showBackButton = true,
  modeSwitchControl,
  onExit,
}: BulkGoalFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const completeAndExit = useCallback(() => {
    if (onExit) {
      onExit();
      return;
    }
    router.replace("/");
    router.refresh();
  }, [onExit, router]);
  const [inputMode, setInputMode] = useState<BulkInputMode>("natural_language");
  const [initializing, setInitializing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("");
  const [csvInput, setCsvInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<BulkGoalDraft[]>([]);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [availableGoals, setAvailableGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        router.replace(buildLoginHref(nextPath));
        return;
      }

      setCurrentUserId(user.id);
      const [goalOptionsResponse, progress] = await Promise.all([
        supabase
          .from("goals")
          .select("*")
          .eq("owner_id", user.id)
          .eq("is_deleted", false)
          .order("title"),
        fetchProgressContext({ asOfDate: toLocalDateString() }),
      ]);

      if (goalOptionsResponse.error) {
        toast.error("Could not load linkable goals.");
      } else {
        const goals = (goalOptionsResponse.data ?? []) as Goal[];
        const progressByGoal = progressSummaryMap(progress);
        // Achievement stops planner placement, but active goals remain
        // linkable so users can intentionally continue beyond a target.
        setAvailableGoals(
          goals.filter(
            (goal) =>
              goal.team_id === null &&
              progressByGoal.get(goal.id)?.lifecycle === "active"
          )
        );
      }

      setInitializing(false);
    };

    void run().catch((error: unknown) => {
      setInitializing(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load linkable goals."
      );
    });
  }, [router, supabase]);

  const selectedDrafts = useMemo(() => drafts.filter((draft) => draft.include), [drafts]);
  const selectedInvalidCount = useMemo(
    () => selectedDrafts.filter((draft) => draft.errors.length > 0).length,
    [selectedDrafts]
  );

  const updateDraft = (
    draftId: string,
    updater: (draft: Omit<BulkGoalDraft, "errors">) => Omit<BulkGoalDraft, "errors">
  ) => {
    setDrafts((previous) =>
      previous.map((draft) => {
        if (draft.id !== draftId) {
          return draft;
        }

        return withValidatedBulkGoalDraft(updater(draft));
      })
    );
  };

  const loadDraftsFromRows = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) {
      toast.error("No rows found. Include a header row and at least one goal.");
      return;
    }

    const nextDrafts = rows.map((row, index) =>
      buildBulkGoalDraftFromRow(row, index)
    );
    setDrafts(nextDrafts);
    setExpandedDraftId(null);
    toast.success(`Loaded ${nextDrafts.length} goal draft${nextDrafts.length === 1 ? "" : "s"}.`);
  };

  const parseCsvInput = async () => {
    const trimmed = csvInput.trim();
    if (!trimmed) {
      toast.error("Paste CSV content first.");
      return;
    }

    setParsing(true);
    try {
      const rows = await parseRowsFromCsvText(trimmed);
      loadDraftsFromRows(rows);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not parse CSV text."
      );
    } finally {
      setParsing(false);
    }
  };

  const parseNaturalLanguageInput = async () => {
    const trimmed = naturalLanguageInput.trim();
    if (!trimmed) {
      toast.error("Describe at least one goal first.");
      return;
    }

    setParsing(true);
    try {
      const payload = await postJson<{
        goals?: LlmGoalDraftPayload[];
        warnings?: string[];
        code?: string;
        message?: string;
        correlationId?: string;
      }>(
        "/api/bulk-goals/parse",
        {
          prompt: trimmed,
          timezone: resolveUserTimezone(),
        }
      );

      const goals = payload.goals ?? [];
      if (goals.length === 0) {
        toast.error("No goals found in that prompt. Try adding more detail.");
        return;
      }

      const nextDrafts = buildBulkGoalDraftsFromLlmGoals(goals);
      setDrafts(nextDrafts);
      setExpandedDraftId(null);
      toast.success(
        `Loaded ${nextDrafts.length} goal draft${nextDrafts.length === 1 ? "" : "s"}.`
      );
      if (payload.warnings && payload.warnings.length > 0) {
        toast.warning(
          payload.warnings.length === 1
            ? payload.warnings[0]
            : `${payload.warnings.length} generated drafts need edits before saving.`
        );
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not parse natural language input."));
    } finally {
      setParsing(false);
    }
  };

  const parseUploadedFile = async () => {
    if (!uploadedFile) {
      toast.error("Choose a CSV/XLSX file first.");
      return;
    }

    setParsing(true);
    try {
      const rows = await parseRowsFromSpreadsheetFile(uploadedFile);
      loadDraftsFromRows(rows);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not parse uploaded file."
      );
    } finally {
      setParsing(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadedFile(event.target.files?.[0] ?? null);
  };

  const createSelectedGoals = async () => {
    if (!currentUserId) {
      toast.error("You must be logged in.");
      return;
    }

    if (selectedDrafts.length === 0) {
      toast.error("Select at least one draft to create.");
      return;
    }

    if (selectedInvalidCount > 0) {
      toast.error("Fix validation issues in selected drafts before creating.");
      return;
    }

    setSaving(true);
    try {
      const preparedRows = prepareBulkGoalRows(selectedDrafts);

      const { error } = await supabase.rpc("create_goals", {
        p_goals: preparedRows.map((entry) => entry.row),
      });
      if (error) {
        toast.error(error.message ?? "Failed to create bulk goals.");
        return;
      }

      const linkRows = preparedRows
        .filter(
          ({ draft }) => draft.linked_target_goal_id && draft.linked_target_goal_id !== "none"
        )
        .map(({ draft, goalId }) => ({
          source_goal_id: goalId,
          target_goal_id: draft.linked_target_goal_id,
        }));

      if (linkRows.length > 0) {
        const { error: linkError } = await supabase.rpc("create_goal_links", {
          p_links: linkRows,
        });
        if (linkError) {
          toast.error(`Some linked goals were not saved: ${linkError.message}`);
        }
      }

      let failedPhotoUploads = 0;
      for (const { draft, goalId } of preparedRows) {
        if (!draft.photo_file) {
          continue;
        }

        const fileName = `${Date.now()}-${draft.photo_file.name.replace(/\s+/g, "-")}`;
        const objectPath = `${currentUserId}/${goalId}/${fileName}`;
        const uploadResponse = await supabase.storage.from("goal-photos").upload(objectPath, draft.photo_file, {
          cacheControl: "3600",
          upsert: true,
        });

        if (uploadResponse.error) {
          failedPhotoUploads += 1;
          continue;
        }

        const { error: updateError } = await supabase.rpc("set_goal_photo_path", {
          p_goal_id: goalId,
          p_photo_path: objectPath,
        });

        if (updateError) {
          failedPhotoUploads += 1;
        }
      }

      if (failedPhotoUploads > 0) {
        toast.error(
          `${failedPhotoUploads} photo upload${failedPhotoUploads === 1 ? "" : "s"} could not be saved.`
        );
      }

      invalidatePlannerRelatedTabCaches();
      toast.success(
        `Created ${preparedRows.length} goal${preparedRows.length === 1 ? "" : "s"}.`
      );
      completeAndExit();
    } finally {
      setSaving(false);
    }
  };

  if (initializing) {
    return (
      <LoadingCard
        title="Loading bulk goal creator..."
        description="Preparing your workspace."
      />
    );
  }

  return (
    <div className="space-y-5">
      <BulkGoalInputCard
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        modeSwitchControl={modeSwitchControl}
        showBackButton={showBackButton}
        onExit={onExit}
        naturalLanguageInput={naturalLanguageInput}
        onNaturalLanguageInputChange={setNaturalLanguageInput}
        csvInput={csvInput}
        onCsvInputChange={setCsvInput}
        csvExample={csvExample}
        onUseCsvExample={() => setCsvInput(csvExample)}
        parsing={parsing}
        onParseNaturalLanguage={parseNaturalLanguageInput}
        onParseCsv={parseCsvInput}
        onFileChange={onFileChange}
        onParseUploadedFile={parseUploadedFile}
        uploadedFileName={uploadedFile?.name ?? null}
      />

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Preview drafts</CardTitle>
              <CardDescription>
                Review and edit parsed goals before creating them.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {selectedDrafts.length} selected
              </Badge>
              <Badge variant="outline">
                {selectedInvalidCount} selected with errors
              </Badge>
              <Button
                type="button"
                onClick={createSelectedGoals}
                disabled={saving || selectedDrafts.length === 0}
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Create selected goals
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {inputMode === "natural_language"
                ? "Parse natural language input to generate drafts."
                : "Parse CSV input or upload a file to generate drafts."}
            </p>
          ) : (
            drafts.map((draft) => {
              const parsedTargetCount = parseBulkGoalTargetCount(
                draft.target_count
              );
              const fixedMilestoneCount =
                draft.frequency_type === "fixed_milestones"
                  ? parsedTargetCount ?? 0
                  : 0;
              const usesSoftHorizon = bulkGoalDraftRequiresEndDate(draft);
              const linkQuery = draft.link_target_search.trim().toLowerCase();
              const filteredLinkTargets = availableGoals.filter((goal) => {
                if (linkQuery.length === 0) {
                  return true;
                }

                const recurrenceLabel = getLinkedGoalRecurrenceLabel(goal).toLowerCase();
                const deadlineLabel = getLinkedGoalDeadlineLabel(goal).toLowerCase();
                return (
                  goal.title.toLowerCase().includes(linkQuery) ||
                  recurrenceLabel.includes(linkQuery) ||
                  deadlineLabel.includes(linkQuery)
                );
              });
              const expanded = expandedDraftId === draft.id;
              const scheduleSummary = draft.end_date
                ? `${draft.start_date} to ${draft.end_date}`
                : `Starts ${draft.start_date}`;
              const recurrenceSummary =
                draft.frequency_type === "recurring"
                  ? `Recurring · ${draft.recurrence_interval}`
                  : `Milestones · ${draft.target_count || "0"} target`;
              const toggleDraftEditor = () =>
                setExpandedDraftId((previous) =>
                  previous === draft.id ? null : draft.id
                );

              return (
                <div key={draft.id} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex shrink-0 items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={draft.include}
                        onChange={(event) =>
                          updateDraft(draft.id, (previous) => ({
                            ...previous,
                            include: event.target.checked,
                          }))
                        }
                      />
                      {draft.sourceRowLabel}
                    </label>
                    <div
                      className={cn(
                        "min-w-0 flex-1 cursor-pointer rounded-lg border bg-muted/10 px-3 py-2 transition-colors hover:bg-muted/20",
                        draft.include && draft.errors.length > 0 && "border-destructive/50"
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={toggleDraftEditor}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleDraftEditor();
                        }
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">
                            {draft.title.trim().length > 0 ? draft.title : "Untitled goal"}
                          </span>
                          <Badge variant="outline">{draft.category_selection}</Badge>
                          <Badge variant="outline">{recurrenceSummary}</Badge>
                          <Badge variant="outline">{scheduleSummary}</Badge>
                          {draft.errors.length > 0 ? (
                            <Badge variant="destructive">
                              {draft.errors.length} error{draft.errors.length === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="px-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleDraftEditor();
                            }}
                          >
                            {expanded ? "close" : "tap to edit"}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDrafts((previous) =>
                                previous.filter((entry) => entry.id !== draft.id)
                              );
                              setExpandedDraftId((previous) =>
                                previous === draft.id ? null : previous
                              );
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {expanded && draft.errors.length > 0 ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                      <ul className="space-y-1 text-xs text-destructive">
                        {draft.errors.map((error) => (
                          <li key={`${draft.id}-${error}`}>- {error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {expanded ? (
                    <Dialog
                      open
                      onOpenChange={(open) => {
                        if (!open) {
                          setExpandedDraftId(null);
                        }
                      }}
                    >
                      <DialogContent
                        overlayClassName="z-[115] bg-black/15"
                        className="z-[120] max-h-[88vh] overflow-y-auto sm:!max-w-none"
                        style={{
                          width: "min(calc(100vw - 1.5rem), 62rem)",
                          maxWidth: "min(calc(100vw - 1.5rem), 62rem)",
                        }}
                      >
                        <DialogHeader>
                          <DialogTitle>
                            {draft.title.trim().length > 0 ? draft.title : "Edit goal draft"}
                          </DialogTitle>
                          <DialogDescription>
                            Update this draft before creating goals.
                          </DialogDescription>
                        </DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={draft.title}
                          onChange={(event) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              title: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Category</Label>
                        <CategorySelect
                          value={draft.category_selection}
                          onValueChange={(value: CategorySelection) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              category_selection: value,
                              color: getCategorySwatchColor(value),
                            }))
                          }
                        />
                      </div>

                      {draft.category_selection === "custom" ? (
                        <div className="space-y-2">
                          <Label>Custom category</Label>
                          <Input
                            value={draft.custom_category}
                            onChange={(event) =>
                              updateDraft(draft.id, (previous) => ({
                                ...previous,
                                custom_category: event.target.value,
                              }))
                            }
                          />
                        </div>
                      ) : null}

                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="inline-flex items-center gap-1">
                          <span>Goal type</span>
                          <TooltipIcon
                            content="Repeated keeps the same action pattern over time. Milestones are unique steps that move you toward a final outcome."
                            label="Goal type help"
                          />
                        </Label>
                        <GoalTypeToggle
                          value={draft.frequency_type}
                          onValueChange={(value) =>
                            updateDraft(draft.id, (previous) => {
                              const nextTargetCount =
                                value === "fixed_milestones" &&
                                previous.target_count.trim().length === 0
                                  ? "3"
                                  : previous.target_count;
                              return {
                                ...previous,
                                frequency_type: value,
                                target_count: nextTargetCount,
                                milestone_names:
                                  value === "fixed_milestones"
                                    ? buildMilestoneNameDrafts(
                                        parseBulkGoalTargetCount(
                                          nextTargetCount
                                        ) ?? 0,
                                        previous.milestone_names
                                      )
                                    : previous.milestone_names,
                              };
                            })
                          }
                        />
                      </div>
                      {draft.frequency_type === "recurring" ? (
                        <div className="space-y-2">
                          <Label className="inline-flex items-center gap-1">
                            <span>Cadence</span>
                            <TooltipIcon
                              content="Cadence controls how often the goal appears in your routine: every day, every week, or every month."
                              label="Cadence help"
                            />
                          </Label>
                          <RecurrenceIntervalToggle
                            value={draft.recurrence_interval}
                            onValueChange={(value) =>
                              updateDraft(draft.id, (previous) => ({
                                ...previous,
                                recurrence_interval: value,
                              }))
                            }
                          />
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label>
                          {draft.frequency_type === "fixed_milestones"
                            ? "Total target #"
                            : "Total target # (optional)"}
                        </Label>
                        <TargetCountField
                          frequencyType={draft.frequency_type}
                          value={draft.target_count}
                          onValueChange={(value) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              target_count: value,
                              milestone_names:
                                previous.frequency_type === "fixed_milestones"
                                  ? buildMilestoneNameDrafts(
                                      parseBulkGoalTargetCount(value) ?? 0,
                                      previous.milestone_names
                                    )
                                  : previous.milestone_names,
                            }))
                          }
                        />
                      </div>

                      <GoalDateRangeFields
                        startDate={draft.start_date}
                        endDate={draft.end_date}
                        onStartDateChange={(value) =>
                          updateDraft(draft.id, (previous) => ({
                            ...previous,
                            start_date: value,
                          }))
                        }
                        onEndDateChange={(value) =>
                          updateDraft(draft.id, (previous) => ({
                            ...previous,
                            end_date: value,
                          }))
                        }
                        requiresEndDate={false}
                        showSoftHorizonHint={usesSoftHorizon}
                      />

                      <GoalDefaultTimeField
                        value={draft.default_local_time}
                        onValueChange={(value) =>
                          updateDraft(draft.id, (previous) => ({
                            ...previous,
                            default_local_time: normalizeBulkGoalLocalTime(value),
                          }))
                        }
                        label="Default time of day"
                        helperText="Optional fallback planner time when no item override is set."
                      />
                    </div>

                    {fixedMilestoneCount > 0 ? (
                      <MilestoneNameFields
                        count={fixedMilestoneCount}
                        values={draft.milestone_names}
                        onValueChange={(index, value) =>
                          updateDraft(draft.id, (previous) => {
                            const nextMilestones = [...previous.milestone_names];
                            nextMilestones[index] = value;
                            return {
                              ...previous,
                              milestone_names: nextMilestones,
                            };
                          })
                        }
                        keyPrefix={`${draft.id}-milestone`}
                      />
                    ) : null}

                    <Collapsible
                      open={draft.advanced_open}
                      onOpenChange={(open) =>
                        updateDraft(draft.id, (previous) => ({
                          ...previous,
                          advanced_open: open,
                        }))
                      }
                    >
                      <div className="rounded-xl border bg-muted/20">
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="flex h-auto w-full items-center justify-between rounded-xl px-3 py-2 text-sm"
                          >
                            <span>Advanced settings (optional)</span>
                            {draft.advanced_open ? (
                              <ChevronUp className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-4 border-t px-3 py-3">
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Textarea
                                value={draft.description}
                                onChange={(event) =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    description: event.target.value,
                                  }))
                                }
                                placeholder="Why this goal matters"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Color accent</Label>
                              <Input
                                type="color"
                                value={draft.color}
                                onChange={(event) =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    color: event.target.value,
                                  }))
                                }
                                className="h-10 p-1"
                              />
                              <p className="text-xs text-muted-foreground">
                                Auto-set from category selection. You can still override it here.
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>Photo</Label>
                              <Input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(event) =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    photo_file: event.target.files?.[0] ?? null,
                                  }))
                                }
                              />
                              {draft.photo_file ? (
                                <Badge variant="secondary">{draft.photo_file.name}</Badge>
                              ) : null}
                            </div>

                            <GoalLinkTargetSelect
                                value={draft.linked_target_goal_id}
                                onValueChange={(value) =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    linked_target_goal_id: value,
                                  }))
                                }
                                open={draft.link_target_open}
                                onOpenChange={(open) =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    link_target_open: open,
                                    link_target_search: open ? previous.link_target_search : "",
                                  }))
                                }
                                searchQuery={draft.link_target_search}
                                onSearchQueryChange={(value) =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    link_target_search: value,
                                  }))
                                }
                                filteredLinkTargets={filteredLinkTargets}
                                keyPrefix={draft.id}
                              />
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
