"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppRouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppRouteError({ error, reset }: AppRouteErrorProps) {
  useEffect(() => {
    console.error("App route failed to render:", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-5" />
        <h2 className="text-lg font-semibold">Could not load this view</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading your latest app state. You can retry now.
      </p>
      <Button type="button" onClick={reset}>
        <RefreshCcw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
