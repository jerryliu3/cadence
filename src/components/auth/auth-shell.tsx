import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title: string;
  description: string;
  alternateHref: string;
  alternateLabel: string;
  alternateText: string;
  backgroundClassName?: string;
  children: ReactNode;
}

export function AuthShell({
  title,
  description,
  alternateHref,
  alternateLabel,
  alternateText,
  backgroundClassName,
  children,
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen items-center justify-center px-4 py-10",
        backgroundClassName ?? "bg-background"
      )}
    >
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {children}
          <p className="text-sm text-muted-foreground">
            {alternateText}{" "}
            <Link className="font-medium text-primary hover:underline" href={alternateHref}>
              {alternateLabel}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
