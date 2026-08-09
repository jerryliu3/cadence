import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSeasonsManager } from "@/features/social/admin-seasons-manager";

export default function AdminSeasonsPage() {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Seasons admin</CardTitle>
          <CardDescription>
            Manage leaderboard seasons and inspect lifecycle state during rollout.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use `/api/admin/seasons` and `/api/admin/seasons/[id]/close` to control season lifecycle.
        </CardContent>
      </Card>
      <AdminSeasonsManager />
    </div>
  );
}
