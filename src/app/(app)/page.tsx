import { redirect } from "next/navigation";
import { ChecklistShell } from "@/features/today/checklist-shell";

function readParam(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const tab = readParam(resolvedSearchParams.tab);
  const month = readParam(resolvedSearchParams.month);
  const day = readParam(resolvedSearchParams.day);
  const view = readParam(resolvedSearchParams.view);

  if (tab === "calendar" || day !== null) {
    const calendarParams = new URLSearchParams();
    if (month) {
      calendarParams.set("month", month);
    }
    if (day) {
      calendarParams.set("day", day);
    }
    if (view) {
      calendarParams.set("view", view);
    }
    const query = calendarParams.toString();
    redirect(query.length > 0 ? `/calendar?${query}` : "/calendar");
  }

  return <ChecklistShell />;
}
