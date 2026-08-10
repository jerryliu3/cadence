"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CollapsibleGoalSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  count: number;
  icon: ReactNode;
  emptyMessage: string;
  children: ReactNode;
}

export function CollapsibleGoalSection({
  open,
  onOpenChange,
  title,
  count,
  icon,
  emptyMessage,
  children,
}: CollapsibleGoalSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-base">{title}</CardTitle>
              <Badge variant="secondary">{count}</Badge>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {count === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
