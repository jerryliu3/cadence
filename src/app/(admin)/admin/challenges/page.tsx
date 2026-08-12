import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminChallengesPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Challenges admin</CardTitle>
        <CardDescription>
          Challenge CRUD and publication controls will land in subsequent social phases.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Challenge lifecycle management is not enabled yet.
      </CardContent>
    </Card>
  );
}
