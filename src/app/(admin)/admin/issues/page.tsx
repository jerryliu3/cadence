import { formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

interface IssueReportRow {
  id: string;
  reporter_id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
}

function toRelativeTime(value: string) {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${formatDistanceToNowStrict(parsed, { addSuffix: true })} (${value})`;
}

export default async function AdminIssueReportsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("issue_reports")
    .select("id, reporter_id, title, description, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = ((data ?? []) as IssueReportRow[]).map((row) => ({
    ...row,
    title: row.title.trim(),
    description: row.description.trim(),
  }));

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Issue reports</CardTitle>
        <CardDescription>
          Reports submitted from the Settings support panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-destructive">
            Could not load issue reports: {error.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No issue reports have been submitted yet.
          </p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{row.title}</p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {row.status}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {row.description}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Reporter: {row.reporter_id}
              </p>
              <p className="text-xs text-muted-foreground">
                Submitted: {toRelativeTime(row.created_at)}
              </p>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}
