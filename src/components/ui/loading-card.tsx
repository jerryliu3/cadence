"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LoadingCardProps {
  title: string;
  description?: string;
}

export function LoadingCard({ title, description }: LoadingCardProps) {
  return (
    <Card data-testid="loading-card-skeleton" aria-busy="true" aria-live="polite">
      <CardHeader>
        <CardTitle className="sr-only">{title}</CardTitle>
        {description ? <CardDescription className="sr-only">{description}</CardDescription> : null}
        <div className="space-y-3" aria-hidden="true">
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full animate-pulse rounded-md bg-muted/80" />
          <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted/70" />
        </div>
      </CardHeader>
    </Card>
  );
}
