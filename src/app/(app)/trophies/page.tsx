import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TrophiesPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Trophy Case</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The full trophies and personal awards view is coming next in this stack.
        </CardContent>
      </Card>
    </div>
  );
}
