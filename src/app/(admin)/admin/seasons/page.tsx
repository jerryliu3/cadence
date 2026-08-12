import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminSeasonsPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Seasons admin</CardTitle>
        <CardDescription>
          Leaderboard season controls will land in the leaderboard phases.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Season orchestration is not enabled yet.
      </CardContent>
    </Card>
  );
}
