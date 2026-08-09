import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminFeedModerationForm } from "@/features/social/admin-feed-moderation-form";

export default function AdminModerationPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Moderation queue</CardTitle>
        <CardDescription>
          Feed moderation actions and leaderboard bans will be surfaced here.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p className="mb-3">
          Hide and unhide feed events while social feed rollout is in progress.
        </p>
        <AdminFeedModerationForm />
      </CardContent>
    </Card>
  );
}
