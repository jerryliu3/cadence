import { Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface GoalEndMonthBadgeProps {
  endDate: string | null;
}

export function GoalEndMonthBadge({ endDate }: GoalEndMonthBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className="h-5 gap-1 rounded-md px-1.5 font-medium text-[11px] text-sky-800 dark:text-sky-100"
    >
      <Calendar className="size-3" aria-hidden="true" />
      <span>{endDate ? format(parseISO(endDate), "MMM d, yyyy") : "No date"}</span>
    </Badge>
  );
}
