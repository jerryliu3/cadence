"use client";

import { format } from "date-fns";
import {
  ArrowLeft,
  FileSpreadsheet,
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
import { toLocalDateString } from "@/lib/dates/day";
import {
  CATEGORY_PRESETS,
  type CategorySelection,
  getCategoryLabel,
  getCategorySelectionFromValue,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import type { GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const frequencyOptions: Array<{ value: GoalFrequencyType; label: string }> = [
  { value: "recurring", label: "Recurring" },
  { value: "fixed_milestones", label: "Fixed milestones" },
];

const recurrenceOptions: Array<{ value: RecurrenceInterval; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const columnAliases = {
  title: ["title", "goal", "goal_title", "name"],
  category: ["category", "tag"],
  frequency_type: ["frequency_type", "frequency", "type"],
  recurrence_interval: ["recurrence_interval", "recurrence", "interval"],
  target_count: ["target_count", "target", "count", "milestones"],
  start_date: ["start_date", "start", "startdate"],
  end_date: ["end_date", "end", "enddate", "due_date", "due"],
} as const;

interface BulkGoalDraft {
  id: string;
  sourceRowLabel: string;
  include: boolean;
  title: string;
  category_selection: CategorySelection;
  custom_category: string;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval;
  target_count: string;
  start_date: string;
  end_date: string;
  errors: string[];
}

const csvExample = `title,category,frequency_type,recurrence_interval,target_count,start_date,end_date
Morning run,Health,recurring,daily,20,2026-06-01,2026-12-31
Read 12 books,Personal,fixed_milestones,,12,2026-06-01,2026-12-31`;

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
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return format(raw, "yyyy-MM-dd");
  }

  const text = String(raw ?? "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return format(parsed, "yyyy-MM-dd");
}

function parseTargetCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function validateDraft(draft: BulkGoalDraft): string[] {
  const errors: string[] = [];
  const parsedTarget = parseTargetCount(draft.target_count);

  if (!draft.title.trim()) {
    errors.push("Title is required.");
  }

  if (draft.category_selection === "custom" && !draft.custom_category.trim()) {
    errors.push("Custom category name is required.");
  }

  if (draft.frequency_type === "fixed_milestones") {
    if (parsedTarget === null || parsedTarget <= 0) {
      errors.push("Fixed milestones require a positive target count.");
    }
  }

  if (draft.frequency_type === "recurring" && draft.target_count.trim().length > 0) {
    if (parsedTarget === null || parsedTarget <= 0) {
      errors.push("Recurring target count must be a positive number.");
    }
    if (!draft.end_date) {
      errors.push("Recurring goals with a target count require an end date.");
    }
  }

  if (!draft.start_date) {
    errors.push("Start date is required.");
  }

  if (draft.end_date && draft.start_date && draft.end_date < draft.start_date) {
    errors.push("End date cannot be before start date.");
  }

  return errors;
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

  return withValidatedDraft({
    id: crypto.randomUUID(),
    sourceRowLabel: `Row ${rowIndex + 2}`,
    include: true,
    title: extractText(normalizedRow, columnAliases.title),
    category_selection: categoryState.selection,
    custom_category: categoryState.customValue,
    frequency_type: frequencyType,
    recurrence_interval: parseRecurrenceInterval(
      extractText(normalizedRow, columnAliases.recurrence_interval)
    ),
    target_count:
      targetRaw.length > 0 ? targetRaw : frequencyType === "fixed_milestones" ? "3" : "",
    start_date:
      normalizeDateValue(normalizedRow[normalizeHeaderKey(columnAliases.start_date[0])]) ||
      normalizeDateValue(extractText(normalizedRow, columnAliases.start_date)) ||
      toLocalDateString(),
    end_date:
      normalizeDateValue(normalizedRow[normalizeHeaderKey(columnAliases.end_date[0])]) ||
      normalizeDateValue(extractText(normalizedRow, columnAliases.end_date)),
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
  const [initializing, setInitializing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [csvInput, setCsvInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<BulkGoalDraft[]>([]);

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
      setInitializing(false);
    };

    void run();
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

    const rows = selectedDrafts.map((draft) => {
      const parsedTargetCount = parseTargetCount(draft.target_count);
      return {
        id: crypto.randomUUID(),
        owner_id: currentUserId,
        title: draft.title.trim(),
        description: null,
        category: getCategoryLabel(draft.category_selection, draft.custom_category),
        color: getCategorySwatchColor(draft.category_selection),
        frequency_type: draft.frequency_type,
        recurrence_interval:
          draft.frequency_type === "recurring" ? draft.recurrence_interval : null,
        target_count:
          draft.frequency_type === "fixed_milestones"
            ? parsedTargetCount
            : parsedTargetCount,
        start_date: draft.start_date,
        end_date: draft.end_date || null,
        is_group: false,
        is_deleted: false,
      };
    });

    const { error } = await supabase.from("goals").insert(rows);
    if (error) {
      toast.error(error.message ?? "Failed to create bulk goals.");
      setSaving(false);
      return;
    }

    toast.success(`Created ${rows.length} goal${rows.length === 1 ? "" : "s"}.`);
    router.replace("/");
    router.refresh();
    setSaving(false);
  };

  if (initializing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading bulk goal creator...</CardTitle>
          <CardDescription>Preparing your workspace.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>New bulk goals</CardTitle>
              <CardDescription>
                Paste CSV or upload CSV/XLSX, review drafts, then approve in one click.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
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
              placeholder="title,category,frequency_type,recurrence_interval,target_count,start_date,end_date"
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
              <Button type="button" variant="outline" onClick={parseUploadedFile} disabled={parsing}>
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
              Supported columns: title, category, frequency_type, recurrence_interval,
              target_count, start_date, end_date.
            </p>
          </section>
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
              Parse CSV input or upload a file to generate drafts.
            </p>
          ) : (
            drafts.map((draft) => (
              <Card
                key={draft.id}
                className={cn(
                  "border shadow-none",
                  draft.include && draft.errors.length > 0 && "border-destructive/50"
                )}
              >
                <CardContent className="space-y-3 py-4">
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
                        setDrafts((previous) =>
                          previous.filter((entry) => entry.id !== draft.id)
                        )
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
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_PRESETS.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom</SelectItem>
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
                      <Label>Frequency</Label>
                      <div className="flex flex-wrap gap-2">
                        {frequencyOptions.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant={
                              draft.frequency_type === option.value ? "secondary" : "outline"
                            }
                            className="rounded-full"
                            onClick={() =>
                              updateDraft(draft.id, (previous) => ({
                                ...previous,
                                frequency_type: option.value,
                                target_count:
                                  option.value === "fixed_milestones" &&
                                  previous.target_count.trim().length === 0
                                    ? "3"
                                    : previous.target_count,
                              }))
                            }
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {draft.frequency_type === "recurring" ? (
                      <div className="space-y-2">
                        <Label>Recurrence</Label>
                        <div className="flex flex-wrap gap-2">
                          {recurrenceOptions.map((option) => (
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
                      <Label>Target count</Label>
                      <Input
                        type="number"
                        min={1}
                        value={draft.target_count}
                        onChange={(event) =>
                          updateDraft(draft.id, (previous) => ({
                            ...previous,
                            target_count: event.target.value,
                          }))
                        }
                      />
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
                      <Label>End date</Label>
                      <Input
                        type="date"
                        value={draft.end_date}
                        onChange={(event) =>
                          updateDraft(draft.id, (previous) => ({
                            ...previous,
                            end_date: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
