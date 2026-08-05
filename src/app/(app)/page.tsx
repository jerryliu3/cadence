import { ChecklistShell } from "@/features/today/checklist-shell";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";

export default function TodayPage() {
  let calendarEnabled = true;
  try {
    calendarEnabled = getPlannerCapabilities().calendarEnabled;
  } catch {
    // Keep the shell renderable even if capabilities parsing regresses.
  }
  return <ChecklistShell calendarEnabled={calendarEnabled} />;
}
