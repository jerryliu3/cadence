"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function GlobalError({
  error,
  unstable_retry,
}: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global app render failed:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center px-4 py-10">
          <div className="flex w-full flex-col items-start gap-4 rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <h1 className="text-lg font-semibold">Something went wrong</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              The app failed to render this page. Try again to re-fetch the latest
              server state.
            </p>
            <Button type="button" onClick={unstable_retry}>
              <RefreshCcw className="size-4" />
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
