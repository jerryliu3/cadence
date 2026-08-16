import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboardPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Admin dashboard</CardTitle>
        <CardDescription>
          Manage social leaderboards and moderation controls directly from this dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Use the links below to open each admin workspace.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link className="text-primary hover:underline" href="/admin/challenges">
              Challenges
            </Link>
          </li>
          <li>
            <Link className="text-primary hover:underline" href="/admin/seasons">
              Seasons
            </Link>
          </li>
          <li>
            <Link className="text-primary hover:underline" href="/admin/moderation">
              Moderation
            </Link>
          </li>
          <li>
            <Link className="text-primary hover:underline" href="/admin/issues">
              Issue reports
            </Link>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
