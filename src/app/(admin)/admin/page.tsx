import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboardPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Admin dashboard</CardTitle>
        <CardDescription>
          Social moderation and control surfaces are staged behind this route group.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Use the links below to access the scoped workspaces as each phase lands.
        </p>
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
        </ul>
      </CardContent>
    </Card>
  );
}
