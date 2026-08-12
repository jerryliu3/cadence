import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
        Moderation tooling is not enabled yet.
      </CardContent>
    </Card>
  );
}
