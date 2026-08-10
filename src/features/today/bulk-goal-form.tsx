"use client";

import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Link2,
  LoaderCircle,
  ListChecks,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GoalsSurfaceLoadingCard } from "@/features/goals/goals-surface-loading-card";
import { getApiErrorMessage, postJson } from "@/lib/api/client";
import { toLocalDateString } from "@/lib/dates/day";
import {
  CATEGORY_PRESETS,
  type CategorySelection,
  getCategorySelectionFromValue,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import {
  deriveDefinitionTargetCount,
  getFixedMilestoneCount,
  requiresGoalEndDate,
} from "@/lib/goals/form-derivations";
import { GOAL_TYPE_OPTIONS, RECURRENCE_INTERVAL_OPTIONS } from "@/lib/goals/form-options";
import { buildGoalRowPayload } from "@/lib/goals/form-payload";
import {
  isValidHexColor,
  normalizeGoalDateValue,
  normalizeLocalTimeValue,
  parseBooleanCellValue,
  parseGoalTargetCount,
} from "@/lib/goals/form-parsing";
import {
  applyFrequencyTypeChange,
  applyMilestoneNameChange,
  applyTargetCountChange,
} from "@/lib/goals/form-state-transitions";
import { validateGoalFormInput } from "@/lib/goals/form-validation";
import {
  fetchProgressContext,
  progressSummaryMap,
} from "@/lib/goals/progress-context";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
} from "@/lib/goals/linked-goal-labels";
import {
  filterGoalsByLinkSearch,
  filterLinkableGoals,
} from "@/lib/goals/linkable-goals";
import {
  buildMilestoneNameDrafts,
  defaultMilestoneName,
} from "@/lib/goals/milestones";
import type { Goal, GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const columnAliases = {
  title: ["title", "goal", "goal_title", "name"],
  description: ["description", "details", "notes"],
  category: ["category", "tag"],
  color: ["color", "accent_color", "hex_color"],
  is_group: ["is_group", "group_goal", "collaborative", "is_collaborative"],
  frequency_type: ["frequency_type", "frequency", "type"],
  recurrence_interval: ["recurrence_interval", "recurrence", "interval"],
  target_count: ["target_count", "target", "count", "milestones"],
  milestone_names: ["milestone_names", "milestones_list", "steps", "step_names"],
  start_date: ["start_date", "start", "startdate"],
  end_date: ["end_date", "end", "enddate", "due_date", "due"],
  default_local_time: ["default_local_time", "default_time", "time_of_day", "local_time"],
} as const;

interface BulkGoalDraft {
  id: string;
  sourceRowLabel: string;
  include: boolean;
  title: string;
  description: string;
  category_selection: CategorySelection;
  custom_category: string;
  color: string;
  is_group: boolean;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval;
  target_count: string;
  milestone_names: string[];
  start_date: string;
  end_date: string;
  default_local_time: string;
  linked_target_goal_id: string;
  link_target_search: string;
  link_target_open: boolean;
  advanced_open: boolean;
  photo_file: File | null;
  errors: string[];
}

interface LlmGoalDraftPayload {
  title?: string;
  description?: string | null;
  category?: string | null;
  frequency_type?: GoalFrequencyType;
  recurrence_interval?: RecurrenceInterval | null;
  target_count?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  default_local_time?: string | null;
}

type BulkInputMode = "natural_language" | "csv";

const csvExample = `title,description,category,color,is_group,frequency_type,recurrence_interval,target_count,milestone_names,start_date,end_date,default_local_time
Morning run,Train for a half marathon,Health,#16a34a,false,recurring,daily,20,,2026-06-01,2026-12-31,06:45
Read 12 books,One book per month,Personal,#6366f1,false,fixed,,12,Book 1|Book 2|Book 3,2026-06-01,2026-12-31,`;

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(row).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    accumulator[normalizeHeaderKey(key)] = value;
    return accumulator;
  }, {});
}

function extractText(row: Record<string, unknown>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    const value = row[normalizedAlias];
    if (value !== undefined && value !== null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }

  return "";
}

function parseFrequencyType(raw: string): GoalFrequencyType {
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes("milestone") || normalized.includes("fixed")) {
    return "fixed_milestones";
  }
  return "recurring";
}

function parseRecurrenceInterval(raw: string): RecurrenceInterval {
  const normalized = raw.trim().toLowerCase();
  if (normalized.startsWith("week")) {
    return "weekly";
  }
  if (normalized.startsWith("month")) {
    return "monthly";
  }
  return "daily";
}

function normalizeDateValue(raw: unknown): string {
  return normalizeGoalDateValue(raw);
}

function parseTargetCount(raw: string): number | null {
  return parseGoalTargetCount(raw);
}

function parseBooleanValue(raw: string): boolean {
  return parseBooleanCellValue(raw);
}

function parseMilestoneNames(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split("|")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function validateDraft(draft: BulkGoalDraft): string[] {
  return validateGoalFormInput(draft, {
    validateHexColor: true,
    validateMilestoneNameAlignment: true,
    validateGroupLinkExclusion: true,
    requireStartDate: true,
  });
}

function withValidatedDraft(draft: Omit<BulkGoalDraft, "errors">): BulkGoalDraft {
  return {
    ...draft,
    errors: validateDraft({ ...draft, errors: [] }),
  };
}

function buildDraftFromRow(row: Record<string, unknown>, rowIndex: number): BulkGoalDraft {
  const normalizedRow = normalizeRowKeys(row);
  const categoryRaw = extractText(normalizedRow, columnAliases.category);
  const categoryState =
    categoryRaw.length > 0
      ? getCategorySelectionFromValue(categoryRaw)
      : { selection: "personal" as CategorySelection, customValue: "" };
  const frequencyType = parseFrequencyType(
    extractText(normalizedRow, columnAliases.frequency_type)
  );
  const targetRaw = extractText(normalizedRow, columnAliases.target_count);
  const parsedTarget =
    targetRaw.length > 0
      ? parseTargetCount(targetRaw)
      : frequencyType === "fixed_milestones"
        ? 3
        : null;
  const parsedMilestoneNames = parseMilestoneNames(
    extractText(normalizedRow, columnAliases.milestone_names)
  );
  const categoryColor = getCategorySwatchColor(categoryState.selection);
  const parsedColor = extractText(normalizedRow, columnAliases.color);
  const draftColor = isValidHexColor(parsedColor) ? parsedColor : categoryColor;

  return withValidatedDraft({
    id: crypto.randomUUID(),
    sourceRowLabel: `Row ${rowIndex + 2}`,
    include: true,
    title: extractText(normalizedRow, columnAliases.title),
    description: extractText(normalizedRow, columnAliases.description),
    category_selection: categoryState.selection,
    custom_category: categoryState.customValue,
    color: draftColor,
    is_group: parseBooleanValue(extractText(normalizedRow, columnAliases.is_group)),
    frequency_type: frequencyType,
    recurrence_interval: parseRecurrenceInterval(
      extractText(normalizedRow, columnAliases.recurrence_interval)
    ),
    target_count:
      targetRaw.length > 0 ? targetRaw : frequencyType === "fixed_milestones" ? "3" : "",
    milestone_names:
      frequencyType === "fixed_milestones"
        ? buildMilestoneNameDrafts(parsedTarget ?? 0, parsedMilestoneNames)
        : [],
    start_date:
      normalizeDateValue(normalizedRow[normalizeHeaderKey(columnAliases.start_date[0])]) ||
      normalizeDateValue(extractText(normalizedRow, columnAliases.start_date)) ||
      toLocalDateString(),
    end_date:
      normalizeDateValue(normalizedRow[normalizeHeaderKey(columnAliases.end_date[0])]) ||
      normalizeDateValue(extractText(normalizedRow, columnAliases.end_date)),
    default_local_time: normalizeLocalTimeValue(
      extractText(normalizedRow, columnAliases.default_local_time)
    ),
    linked_target_goal_id: "none",
    link_target_search: "",
    link_target_open: false,
    advanced_open: false,
    photo_file: null,
  });
}

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

export function BulkGoalForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [inputMode, setInputMode] = useState<BulkInputMode>("natural_language");
  const [initializing, setInitializing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("");
  const [csvInput, setCsvInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<BulkGoalDraft[]>([]);
  const [availableGoals, setAvailableGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
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
        setAvailableGoals(filterLinkableGoals(goals, progressByGoal));
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

        return withValidatedDraft(updater(draft));
      })
    );
  };

  const loadDraftsFromRows = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) {
      toast.error("No rows found. Include a header row and at least one goal.");
      return;
    }

    const nextDrafts = rows.map((row, index) => buildDraftFromRow(row, index));
    setDrafts(nextDrafts);
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
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      );

      const goals = payload.goals ?? [];
      if (goals.length === 0) {
        toast.error("No goals found in that prompt. Try adding more detail.");
        return;
      }

      const rows = goals.map((goal) => ({
        title: goal.title ?? "",
        description: goal.description ?? "",
        category: goal.category ?? "",
        frequency_type: goal.frequency_type ?? "recurring",
        recurrence_interval: goal.recurrence_interval ?? "",
        target_count:
          goal.target_count === null || goal.target_count === undefined
            ? ""
            : String(goal.target_count),
        start_date: goal.start_date ?? "",
        end_date: goal.end_date ?? "",
        default_local_time: normalizeLocalTimeValue(goal.default_local_time ?? ""),
      }));

      loadDraftsFromRows(rows);
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
      const preparedRows = selectedDrafts.map((draft) => {
        const goalId = crypto.randomUUID();

        return {
          draft,
          goalId,
          row: buildGoalRowPayload(draft, {
            ownerId: currentUserId,
            goalId,
            includeDeletedFlag: true,
            fallbackInvalidHexColor: true,
          }),
        };
      });

      const { error } = await supabase.from("goals").insert(preparedRows.map((entry) => entry.row));
      if (error) {
        toast.error(error.message ?? "Failed to create bulk goals.");
        return;
      }

      const linkRows = preparedRows
        .filter(
          ({ draft }) => !draft.is_group && draft.linked_target_goal_id && draft.linked_target_goal_id !== "none"
        )
        .map(({ draft, goalId }) => ({
          owner_id: currentUserId,
          source_goal_id: goalId,
          target_goal_id: draft.linked_target_goal_id,
        }));

      if (linkRows.length > 0) {
        const { error: linkError } = await supabase.from("goal_links").insert(linkRows);
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

        const { error: updateError } = await supabase
          .from("goals")
          .update({ photo_path: objectPath })
          .eq("id", goalId)
          .eq("owner_id", currentUserId);

        if (updateError) {
          failedPhotoUploads += 1;
        }
      }

      if (failedPhotoUploads > 0) {
        toast.error(
          `${failedPhotoUploads} photo upload${failedPhotoUploads === 1 ? "" : "s"} could not be saved.`
        );
      }

      toast.success(
        `Created ${preparedRows.length} goal${preparedRows.length === 1 ? "" : "s"}.`
      );
      router.replace(preparedRows.some((entry) => entry.draft.is_group) ? "/settings" : "/");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (initializing) {
    return (
      <GoalsSurfaceLoadingCard
        title="Loading bulk goal creator..."
        description="Preparing your workspace."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>New bulk goals</CardTitle>
              <CardDescription>
                Describe goals with AI, paste CSV, or upload CSV/XLSX, then approve in one click.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={inputMode === "natural_language" ? "secondary" : "ghost"}
                  className="h-8 rounded-md px-3"
                  onClick={() => setInputMode("natural_language")}
                >
                  Natural language
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={inputMode === "csv" ? "secondary" : "ghost"}
                  className="h-8 rounded-md px-3"
                  onClick={() => setInputMode("csv")}
                >
                  CSV
                </Button>
              </div>
              <Button variant="outline" asChild>
                <Link href="/">
                  <ArrowLeft className="size-4" />
                  Back
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {inputMode === "natural_language" ? (
            <section className="space-y-2">
              <Label htmlFor="bulk-natural-language">Describe goals in natural language</Label>
              <Textarea
                id="bulk-natural-language"
                value={naturalLanguageInput}
                onChange={(event) => setNaturalLanguageInput(event.target.value)}
                maxLength={8000}
                placeholder={
                  "Example: I want to run 4 times per week, read 20 books this year, and call my parents every Sunday."
                }
                className="min-h-28"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={parseNaturalLanguageInput}
                  disabled={parsing}
                >
                  {parsing ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Parse natural language
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Uses Gemini through a secure server route. Set <code>GEMINI_API_KEY</code> in{" "}
                <code>.env.local</code>.
              </p>
            </section>
          ) : (
            <>
              <section className="space-y-2">
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="font-medium text-foreground">Example CSV (2 goals)</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                    {csvExample}
                  </pre>
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCsvInput(csvExample)}
                    >
                      Use this example
                    </Button>
                  </div>
                </div>
                <Label htmlFor="bulk-csv-input">Paste CSV content</Label>
                <Textarea
                  id="bulk-csv-input"
                  value={csvInput}
                  onChange={(event) => setCsvInput(event.target.value)}
                  placeholder="title,description,category,color,is_group,frequency_type,recurrence_interval,target_count,milestone_names,start_date,end_date,default_local_time"
                  className="min-h-36"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={parseCsvInput} disabled={parsing}>
                    {parsing ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ListChecks className="size-4" />
                    )}
                    Parse pasted CSV
                  </Button>
                </div>
              </section>

              <section className="space-y-2">
                <Label htmlFor="bulk-file-upload">Upload file</Label>
                <Input
                  id="bulk-file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={onFileChange}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={parseUploadedFile}
                    disabled={parsing}
                  >
                    {parsing ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    Parse uploaded file
                  </Button>
                  {uploadedFile ? (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      <FileSpreadsheet className="size-3.5" />
                      {uploadedFile.name}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Supported columns: title, description, category, color, is_group,
                  frequency_type, recurrence_interval, target_count, milestone_names, start_date,
                  end_date, default_local_time.
                </p>
              </section>
            </>
          )}
        </CardContent>
      </Card>

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
              const parsedTargetCount = parseTargetCount(draft.target_count);
              const fixedMilestoneCount = getFixedMilestoneCount(
                draft.frequency_type,
                parsedTargetCount
              );
              const definitionTargetCount = deriveDefinitionTargetCount({
                frequencyType: draft.frequency_type,
                targetCountRaw: draft.target_count,
                parsedTargetCount,
              });
              const requiresEndDate = requiresGoalEndDate(
                draft.frequency_type,
                definitionTargetCount
              );
              const filteredLinkTargets = filterGoalsByLinkSearch(
                availableGoals,
                draft.link_target_search
              );

              return (
                <Card
                  key={draft.id}
                  className={cn(
                    "border shadow-none",
                    draft.include && draft.errors.length > 0 && "border-destructive/50"
                  )}
                >
                  <CardContent className="space-y-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setDrafts((previous) => previous.filter((entry) => entry.id !== draft.id))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {draft.errors.length > 0 ? (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                        <ul className="space-y-1 text-xs text-destructive">
                          {draft.errors.map((error) => (
                            <li key={`${draft.id}-${error}`}>- {error}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

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
                        <Select
                          value={draft.category_selection}
                          onValueChange={(value: CategorySelection) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              category_selection: value,
                              color: getCategorySwatchColor(value),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_PRESETS.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: getCategorySwatchColor(preset.id) }}
                                  />
                                  {preset.label}
                                </span>
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: getCategorySwatchColor("custom") }}
                                />
                                Custom
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
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
                        <Label>Goal type</Label>
                        <div className="flex flex-wrap gap-2">
                          {GOAL_TYPE_OPTIONS.map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              size="sm"
                              variant={
                                draft.frequency_type === option.value ? "secondary" : "outline"
                              }
                              className="rounded-full"
                              onClick={() =>
                                updateDraft(draft.id, (previous) =>
                                  applyFrequencyTypeChange(previous, option.value)
                                )
                              }
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {draft.frequency_type === "recurring" ? (
                        <div className="space-y-2">
                          <Label>Recurrence interval</Label>
                          <div className="flex flex-wrap gap-2">
                            {RECURRENCE_INTERVAL_OPTIONS.map((option) => (
                              <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={
                                  draft.recurrence_interval === option.value
                                    ? "secondary"
                                    : "outline"
                                }
                                className="rounded-full"
                                onClick={() =>
                                  updateDraft(draft.id, (previous) => ({
                                    ...previous,
                                    recurrence_interval: option.value,
                                  }))
                                }
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label>
                          {draft.frequency_type === "fixed_milestones"
                            ? "Target count"
                            : "Target completions (optional)"}
                        </Label>
                        <Input
                          type="number"
                          min={draft.frequency_type === "fixed_milestones" ? 1 : 0}
                          value={draft.target_count}
                          onChange={(event) =>
                            updateDraft(draft.id, (previous) =>
                              applyTargetCountChange(previous, event.target.value)
                            )
                          }
                        />
                        {draft.frequency_type === "recurring" ? (
                          <p className="text-xs text-muted-foreground">
                            Optional: set a total due by the end date. Each date
                            is checked independently; target-total goals do not
                            use current-period or streak semantics.
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label>Start date</Label>
                        <Input
                          type="date"
                          value={draft.start_date}
                          onChange={(event) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              start_date: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{requiresEndDate ? "End date" : "End date (optional)"}</Label>
                        <Input
                          type="date"
                          value={draft.end_date}
                          onChange={(event) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              end_date: event.target.value,
                            }))
                          }
                          required={requiresEndDate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Default time of day</Label>
                        <Input
                          type="time"
                          value={draft.default_local_time}
                          onChange={(event) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              default_local_time: normalizeLocalTimeValue(
                                event.target.value
                              ),
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional fallback planner time when no item override is set.
                        </p>
                      </div>
                    </div>

                    {fixedMilestoneCount > 0 ? (
                      <div className="space-y-2">
                        <Label>Milestone names (optional)</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {Array.from({ length: fixedMilestoneCount }).map((_, index) => (
                            <Input
                              key={`${draft.id}-milestone-${index + 1}`}
                              value={draft.milestone_names[index] ?? ""}
                              onChange={(event) =>
                                updateDraft(draft.id, (previous) =>
                                  applyMilestoneNameChange(
                                    previous,
                                    index,
                                    event.target.value
                                  )
                                )
                              }
                              placeholder={defaultMilestoneName(index)}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Leave any field blank to use the default name.
                        </p>
                      </div>
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
                            <span>Advanced settings</span>
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
                              <Label>Photo (optional)</Label>
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

                            <div className="rounded-xl border bg-background/70 p-3">
                              <label className="flex items-start gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={draft.is_group}
                                  onChange={(event) =>
                                    updateDraft(draft.id, (previous) => ({
                                      ...previous,
                                      is_group: event.target.checked,
                                      linked_target_goal_id: event.target.checked
                                        ? "none"
                                        : previous.linked_target_goal_id,
                                    }))
                                  }
                                />
                                <span>
                                  This is a collaborative group goal (participants track their own
                                  completions).
                                </span>
                              </label>
                            </div>

                            {!draft.is_group ? (
                              <div className="space-y-2">
                                <Label className="inline-flex items-center gap-2">
                                  <Link2 className="size-4 text-muted-foreground" />
                                  Link this goal to another goal (optional)
                                </Label>
                                <Select
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
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="No linked target" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <div className="sticky top-0 z-10 border-b bg-popover p-1.5">
                                      <Input
                                        value={draft.link_target_search}
                                        onChange={(event) =>
                                          updateDraft(draft.id, (previous) => ({
                                            ...previous,
                                            link_target_search: event.target.value,
                                          }))
                                        }
                                        placeholder="Search link targets..."
                                        className="h-8"
                                        onKeyDown={(event) => event.stopPropagation()}
                                      />
                                    </div>
                                    <SelectItem value="none">No linked target</SelectItem>
                                    {filteredLinkTargets.map((goal) => (
                                      <SelectItem key={`${draft.id}-${goal.id}`} value={goal.id}>
                                        <span className="flex items-center gap-2">
                                          <span className="max-w-[170px] truncate">{goal.title}</span>
                                          <Badge variant="secondary">
                                            {getLinkedGoalRecurrenceLabel(goal)}
                                          </Badge>
                                          <Badge variant="outline">
                                            {getLinkedGoalDeadlineLabel(goal)}
                                          </Badge>
                                        </span>
                                      </SelectItem>
                                    ))}
                                    {filteredLinkTargets.length === 0 ? (
                                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                        No goals match your search.
                                      </p>
                                    ) : null}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Marking this goal complete will auto-complete linked goals for the
                                  same day.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
