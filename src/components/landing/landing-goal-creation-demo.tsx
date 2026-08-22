"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";

export type CreationDemoMode = "manual" | "natural";
export type CreationDemoPhase =
  | "typing"
  | "parsing"
  | "drafts"
  | "clicking-create"
  | "creating"
  | "created";

const phaseOrder: CreationDemoPhase[] = [
  "typing",
  "parsing",
  "drafts",
  "clicking-create",
  "creating",
  "created",
];

export const creationDemoPrompt =
  "Train for a half marathon this fall. Three runs a week, strength on Tuesdays, rest on Mondays.";

export const creationDemoDrafts = [
  { title: "Half marathon", detail: "Milestone · October 18" },
  { title: "Easy run", detail: "3× weekly · Health" },
  { title: "Strength", detail: "Tuesday recurring" },
  { title: "Rest day", detail: "Monday · protected" },
] as const;

export const creationPhaseDurationMs: Record<
  Exclude<CreationDemoPhase, "typing">,
  number
> = {
  parsing: 700,
  drafts: 1100,
  "clicking-create": 500,
  creating: 650,
  created: 2000,
};

export function nextCreationDemoPhase(
  phase: CreationDemoPhase,
  reducedMotion: boolean
): CreationDemoPhase {
  if (reducedMotion) {
    return "created";
  }
  return phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length];
}

function ModeTab({
  value,
  selected,
  onSelect,
}: {
  value: CreationDemoMode;
  selected: CreationDemoMode;
  onSelect: (value: CreationDemoMode) => void;
}) {
  const label = value === "manual" ? "Manual" : "Natural language";
  const isSelected = selected === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={() => onSelect(value)}
      className={`rounded-md px-2 py-1 ${
        isSelected
          ? "bg-background font-semibold text-foreground shadow-sm"
          : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function SeededField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[8px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium">
        {value}
      </div>
    </div>
  );
}

function ChoiceRow({
  label,
  options,
  selected,
}: {
  label: string;
  options: readonly string[];
  selected: string;
}) {
  return (
    <div>
      <p className="text-[8px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map((option) => (
          <span
            key={option}
            className={`rounded-md border px-2 py-1 text-[10px] font-medium ${
              option === selected
                ? "border-violet-300 bg-violet-50 text-violet-950"
                : "bg-background text-muted-foreground"
            }`}
          >
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

function ManualGoalForm() {
  return (
    <div data-testid="goal-creation-manual" className="space-y-3 p-4">
      <SeededField label="Goal name" value="Easy run" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[8px] font-semibold tracking-wide text-muted-foreground uppercase">
            Category
          </p>
          <div className="mt-1 flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium">
            <span className="size-2 rounded-full bg-emerald-500" />
            Health
          </div>
        </div>
        <SeededField label="Times / period" value="3" />
      </div>
      <ChoiceRow
        label="Type"
        options={["Repeated", "Milestones"]}
        selected="Repeated"
      />
      <ChoiceRow
        label="Repeat"
        options={["Daily", "Weekly", "Monthly"]}
        selected="Weekly"
      />
      <div className="grid grid-cols-2 gap-2">
        <SeededField label="Start date" value="Aug 15" />
        <SeededField label="End date" value="Nov 15" />
      </div>
      <SeededField label="Default time" value="7:00 AM" />
    </div>
  );
}

function NaturalLanguageDemo({
  displayPhase,
  typedText,
  showCaret,
  visibleDraftCount,
}: {
  displayPhase: CreationDemoPhase;
  typedText: string;
  showCaret: boolean;
  visibleDraftCount: number;
}) {
  const statusNote =
    displayPhase === "parsing"
      ? "Turning that into a draft plan"
      : displayPhase === "drafts"
        ? "4 drafts ready to review"
        : displayPhase === "clicking-create"
          ? "Creating selected goals"
          : displayPhase === "creating"
            ? "Creating 4 goals..."
            : displayPhase === "created"
              ? "4 goals created"
              : "Describe the plan in one sentence";

  return (
    <div data-testid="goal-creation-natural" className="space-y-3 p-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
        <p className="text-[9px] font-semibold tracking-wide text-blue-700 uppercase">
          Natural language
        </p>
        <p className="mt-1.5 min-h-12 text-[12px] leading-relaxed text-blue-950">
          {typedText}
          {showCaret ? (
            <span className="ml-px inline-block h-3.5 w-px animate-pulse bg-blue-700 align-middle" />
          ) : null}
        </p>
      </div>

      <div
        data-demo-creation-status={displayPhase}
        className="flex min-h-5 items-center gap-1.5 text-[10px] text-violet-800"
        aria-live="polite"
      >
        {displayPhase === "parsing" || displayPhase === "creating" ? (
          <Loader2 className="size-3 animate-spin" />
        ) : displayPhase === "created" ? (
          <Check className="size-3 text-emerald-700" />
        ) : (
          <Sparkles className="size-3" />
        )}
        <span>{statusNote}</span>
      </div>

      <div className="grid min-h-[7.5rem] grid-cols-2 gap-2">
        {creationDemoDrafts.map((draft, index) => {
          const visible = index < visibleDraftCount;
          return (
            <div
              key={draft.title}
              className={`rounded-lg border border-violet-200 bg-violet-50/70 p-2.5 transition ${
                visible ? "opacity-100" : "opacity-0"
              }`}
            >
              <p className="text-[11px] font-semibold">{draft.title}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">
                {draft.detail}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LandingGoalCreationDemo() {
  const reducedMotion = Boolean(useReducedMotion());
  const [mode, setMode] = useState<CreationDemoMode>("natural");
  const [phase, setPhase] = useState<CreationDemoPhase>("typing");
  const [typedLength, setTypedLength] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const animationActive = isVisible && mode === "natural";
  const displayPhase = reducedMotion ? "created" : phase;
  const visibleDraftCount =
    displayPhase === "typing" || displayPhase === "parsing"
      ? 0
      : creationDemoDrafts.length;
  const typedText = reducedMotion
    ? creationDemoPrompt
    : creationDemoPrompt.slice(0, typedLength);
  const showCaret =
    displayPhase === "typing" && typedLength < creationDemoPrompt.length;

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 }
    );
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!animationActive || reducedMotion || displayPhase !== "typing") {
      return;
    }

    if (typedLength >= creationDemoPrompt.length) {
      const timeoutId = window.setTimeout(() => {
        setPhase((current) => nextCreationDemoPhase(current, false));
      }, 280);
      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      setTypedLength((current) => current + 1);
    }, 18);
    return () => window.clearTimeout(timeoutId);
  }, [animationActive, displayPhase, reducedMotion, typedLength]);

  useEffect(() => {
    if (!animationActive || reducedMotion || displayPhase === "typing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (displayPhase === "created") {
        setTypedLength(0);
        setPhase("typing");
        return;
      }
      setPhase((current) => nextCreationDemoPhase(current, false));
    }, creationPhaseDurationMs[displayPhase]);

    return () => window.clearTimeout(timeoutId);
  }, [animationActive, displayPhase, reducedMotion]);

  return (
    <div
      ref={previewRef}
      data-testid="goal-creation-demo"
      className="overflow-hidden rounded-2xl border bg-card shadow-[0_18px_55px_-35px_rgba(124,58,237,0.5)]"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-xs font-semibold">
            {mode === "manual" ? "Create a goal" : "Create multiple goals"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {mode === "manual" ? "Configure every field" : "Natural language"}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Goal creation mode"
          className="flex rounded-lg bg-muted p-1 text-[9px]"
        >
          <ModeTab value="manual" selected={mode} onSelect={setMode} />
          <ModeTab value="natural" selected={mode} onSelect={setMode} />
        </div>
      </div>

      <div className="grid">
        <div
          className="col-start-1 row-start-1"
          style={{ visibility: mode === "natural" ? "visible" : "hidden" }}
          aria-hidden={mode !== "natural"}
        >
          <NaturalLanguageDemo
            displayPhase={displayPhase}
            typedText={typedText}
            showCaret={showCaret}
            visibleDraftCount={visibleDraftCount}
          />
        </div>
        <div
          className="col-start-1 row-start-1"
          style={{ visibility: mode === "manual" ? "visible" : "hidden" }}
          aria-hidden={mode !== "manual"}
        >
          <ManualGoalForm />
        </div>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/25 px-4 py-2.5">
        <span className="text-[10px] text-muted-foreground">
          {mode === "manual" ? "All fields editable" : "4 selected"}
        </span>
        {mode === "manual" ? (
          <div className="inline-flex h-8 items-center rounded-md bg-violet-700 px-2.5 text-[11px] font-semibold text-white shadow-sm">
            Create goal
          </div>
        ) : (
          <div
            data-demo-create-goals
            className={`inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-md bg-violet-700 px-2.5 text-[11px] font-semibold text-white shadow-sm transition ${
              displayPhase === "clicking-create"
                ? "scale-95 bg-violet-800 ring-2 ring-violet-300 ring-offset-1"
                : ""
            }`}
          >
            {displayPhase === "creating" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : displayPhase === "created" ? (
              <Check className="size-3" />
            ) : (
              <Sparkles className="size-3" />
            )}
            {displayPhase === "creating"
              ? "Creating..."
              : displayPhase === "created"
                ? "4 goals created"
                : "Create selected goals"}
          </div>
        )}
      </div>
    </div>
  );
}
