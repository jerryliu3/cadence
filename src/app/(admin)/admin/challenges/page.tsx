import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminChallengesManager } from "@/features/social/admin-challenges-manager";

export default function AdminChallengesPage() {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Challenges admin</CardTitle>
          <CardDescription>
            Create, edit, close, and hard-delete leaderboard challenges in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Configure challenge parameters directly from this dashboard.
        </CardContent>
      </Card>
      <AdminChallengesManager />
    </div>
  );
}
