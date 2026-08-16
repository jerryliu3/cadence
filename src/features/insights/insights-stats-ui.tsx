"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { TooltipIcon } from "@/components/ui/tooltip-icon";
import type { InsightsCountTrend, InsightsRateTrend } from "@/lib/insights/types";

function formatSigned(value: number, digits = 0) {
  const abs = Math.abs(value);
  const rounded = digits > 0 ? abs.toFixed(digits) : Math.round(abs).toString();
  return `${value >= 0 ? "+" : "-"}${rounded}`;
}

export function InsightsLabelWithTooltip({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span>{label}</span>
      <TooltipIcon content={tooltip} label={`${label} definition`} />
    </span>
  );
}

export function CountTrendInline({
  trend,
  compareLabel,
}: {
  trend: InsightsCountTrend;
  compareLabel: string;
}) {
  const direction = trend.delta === 0 ? "flat" : trend.delta > 0 ? "up" : "down";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {direction === "up" ? <ArrowUpRight className="size-3" /> : null}
      {direction === "down" ? <ArrowDownRight className="size-3" /> : null}
      {direction === "flat" ? <Minus className="size-3" /> : null}
      <span>
        {formatSigned(trend.delta)}
        {trend.deltaPercent !== null ? ` (${formatSigned(trend.deltaPercent, 1)}%)` : ""} vs{" "}
        {compareLabel}
      </span>
    </span>
  );
}

export function RateTrendInline({
  trend,
  compareLabel,
}: {
  trend: InsightsRateTrend;
  compareLabel: string;
}) {
  const direction =
    trend.deltaPercentPoints === 0 ? "flat" : trend.deltaPercentPoints > 0 ? "up" : "down";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {direction === "up" ? <ArrowUpRight className="size-3" /> : null}
      {direction === "down" ? <ArrowDownRight className="size-3" /> : null}
      {direction === "flat" ? <Minus className="size-3" /> : null}
      <span>
        {formatSigned(trend.deltaPercentPoints, 1)} pts vs {compareLabel}
      </span>
    </span>
  );
}
