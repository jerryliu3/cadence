import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSeasonsManager } from "@/features/social/admin-seasons-manager";

export default function AdminSeasonsPage() {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Seasons admin</CardTitle>
          <CardDescription>
            Create, edit, close, and hard-delete leaderboard seasons from this dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Configure season lifecycle and scoring parameters without leaving admin.
        </CardContent>
      </Card>
      <AdminSeasonsManager />
    </div>
  );
}
