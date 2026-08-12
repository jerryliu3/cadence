import { redirect } from "next/navigation";
import {
  isValidCalendarViewMode,
  isValidDate,
  isValidMonth,
} from "@/features/today/checklist-shell-routing";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const day = firstParam(params.day) ?? null;
  const tab = firstParam(params.tab) ?? null;
  const month = firstParam(params.month) ?? null;
  const view = firstParam(params.view) ?? null;

  if (isValidDate(day)) {
    const nextParams = new URLSearchParams();
    nextParams.set("view", "day");
    nextParams.set("day", day);
    nextParams.set("month", day.slice(0, 7));
    redirect(`/calendar?${nextParams.toString()}`);
    return;
  }

  if (tab === "today" || tab === "not-today" || tab === "past") {
    const normalizedTab = tab === "past" ? "not-today" : tab;
    redirect(`/checklist?tab=${normalizedTab}`);
    return;
  }

  const nextParams = new URLSearchParams();
  if (isValidCalendarViewMode(view)) {
    nextParams.set("view", view);
  }
  if (isValidMonth(month)) {
    nextParams.set("month", month);
  }
  const query = nextParams.toString();
  redirect(query.length > 0 ? `/calendar?${query}` : "/calendar");
}
