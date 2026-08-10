"use client";

import type { ChangeEvent, ReactNode } from "react";
import { ArrowLeft, FileSpreadsheet, ListChecks, LoaderCircle, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BulkInputMode } from "@/features/today/bulk-goal-types";

interface BulkGoalInputCardProps {
  inputMode: BulkInputMode;
  onInputModeChange: (mode: BulkInputMode) => void;
  modeSwitchControl?: ReactNode;
  showBackButton?: boolean;
  onExit?: () => void;
  naturalLanguageInput: string;
  onNaturalLanguageInputChange: (value: string) => void;
  csvInput: string;
  onCsvInputChange: (value: string) => void;
  csvExample: string;
  onUseCsvExample: () => void;
  parsing: boolean;
  onParseNaturalLanguage: () => void;
  onParseCsv: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onParseUploadedFile: () => void;
  uploadedFileName: string | null;
}

export function BulkGoalInputCard({
  inputMode,
  onInputModeChange,
  modeSwitchControl,
  showBackButton = true,
  onExit,
  naturalLanguageInput,
  onNaturalLanguageInputChange,
  csvInput,
  onCsvInputChange,
  csvExample,
  onUseCsvExample,
  parsing,
  onParseNaturalLanguage,
  onParseCsv,
  onFileChange,
  onParseUploadedFile,
  uploadedFileName,
}: BulkGoalInputCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Create multiple goals</CardTitle>
              {modeSwitchControl}
            </div>
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
                onClick={() => onInputModeChange("natural_language")}
              >
                Natural language
              </Button>
              <Button
                type="button"
                size="sm"
                variant={inputMode === "csv" ? "secondary" : "ghost"}
                className="h-8 rounded-md px-3"
                onClick={() => onInputModeChange("csv")}
              >
                CSV
              </Button>
            </div>
            {showBackButton ? (
              onExit ? (
                <Button type="button" variant="outline" onClick={onExit}>
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href="/">
                    <ArrowLeft className="size-4" />
                    Back
                  </Link>
                </Button>
              )
            ) : null}
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
              onChange={(event) => onNaturalLanguageInputChange(event.target.value)}
              maxLength={8000}
              placeholder="Example: I want to run 4 times per week, read 20 books this year, and call my parents every Sunday."
              className="min-h-28"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onParseNaturalLanguage}
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
                  <Button type="button" size="sm" variant="outline" onClick={onUseCsvExample}>
                    Use this example
                  </Button>
                </div>
              </div>
              <Label htmlFor="bulk-csv-input">Paste CSV content</Label>
              <Textarea
                id="bulk-csv-input"
                value={csvInput}
                onChange={(event) => onCsvInputChange(event.target.value)}
                placeholder="title,description,category,color,frequency_type,recurrence_interval,target_count,milestone_names,start_date,end_date,default_local_time"
                className="min-h-36"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={onParseCsv} disabled={parsing}>
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
                  onClick={onParseUploadedFile}
                  disabled={parsing}
                >
                  {parsing ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Parse uploaded file
                </Button>
                {uploadedFileName ? (
                  <Badge variant="secondary" className="inline-flex items-center gap-1">
                    <FileSpreadsheet className="size-3.5" />
                    {uploadedFileName}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Supported columns: title, description, category, color,
                frequency_type, recurrence_interval, target_count, milestone_names, start_date,
                end_date, default_local_time.
              </p>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
