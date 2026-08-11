import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminFeedModerationForm } from "@/features/admin/feed-moderation-form";

export default function AdminModerationPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Moderation queue</CardTitle>
        <CardDescription>
          Moderator-only tools for hiding and restoring social feed events.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p className="mb-3">
          Paste a feed event id to hide or unhide it. This page is not shown to
          regular users.
        </p>
        <AdminFeedModerationForm />
      </CardContent>
    </Card>
  );
}
