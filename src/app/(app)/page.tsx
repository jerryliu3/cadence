import { ChecklistShell } from "@/features/today/checklist-shell";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";

export default function TodayPage() {
  const capabilities = getPlannerCapabilities();
  return <ChecklistShell calendarEnabled={capabilities.calendarEnabled} />;
}
