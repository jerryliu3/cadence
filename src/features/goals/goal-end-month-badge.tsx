import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface GoalEndMonthBadgeProps {
  endDate: string | null;
}

export function GoalEndMonthBadge({ endDate }: GoalEndMonthBadgeProps) {
  return (
    <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
      {endDate ? format(parseISO(endDate), "MMM yyyy") : "Undefined"}
    </Badge>
  );
}
