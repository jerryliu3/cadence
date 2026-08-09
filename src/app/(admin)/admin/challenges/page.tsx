import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminChallengesManager } from "@/features/social/admin-challenges-manager";

export default function AdminChallengesPage() {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Challenges admin</CardTitle>
          <CardDescription>
            Manage challenge drafts and monitor lifecycle state during rollout.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use this surface with `/api/admin/challenges` to create and inspect challenge rows.
        </CardContent>
      </Card>
      <AdminChallengesManager />
    </div>
  );
}
