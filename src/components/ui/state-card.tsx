"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StateCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  layout?: "card" | "inline";
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  centered?: boolean;
  dashed?: boolean;
  compact?: boolean;
}

export function StateCard({
  title,
  description,
  icon,
  layout = "inline",
  className,
  titleClassName,
  descriptionClassName,
  centered = false,
  dashed = false,
  compact = false,
}: StateCardProps) {
  const content = (
    <div
      className={cn(
        "space-y-1",
        centered ? "text-center" : "text-left",
        compact ? "text-sm" : "text-base"
      )}
    >
      <CardTitle className={cn(compact ? "text-sm" : "text-base", titleClassName)}>{title}</CardTitle>
      {description ? (
        <CardDescription className={cn(compact ? "text-xs" : "text-sm", descriptionClassName)}>
          {description}
        </CardDescription>
      ) : null}
    </div>
  );

  if (layout === "card") {
    return (
      <Card className={className}>
        <CardHeader
          className={cn(
            "gap-2",
            centered ? "items-center text-center" : undefined,
            compact ? "py-4" : undefined
          )}
        >
          {icon}
          {content}
        </CardHeader>
      </Card>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/10 p-4",
        dashed && "border-dashed",
        centered && "flex items-center justify-center",
        className
      )}
    >
      {icon ? <div className="mr-2">{icon}</div> : null}
      {content}
    </div>
  );
}
