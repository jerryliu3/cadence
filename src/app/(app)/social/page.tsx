import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SocialSurface } from "@/features/social/social-surface";
import { getSocialCapabilities } from "@/lib/social/capabilities";

export default function SocialPage() {
  const capabilities = getSocialCapabilities();

  if (!capabilities.socialEnabled) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Social is not enabled yet</CardTitle>
          <CardDescription>
            Social surfaces are currently staged behind feature flags.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Social is rolling out</CardTitle>
          <CardDescription>
            Feed, challenges, leaderboards, and duo capabilities are exposed in
            phases behind flags.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Turn on `SOCIAL_FEED_ENABLED`, `SOCIAL_CHALLENGES_ENABLED`,
          `SOCIAL_LEADERBOARDS_ENABLED`, `SOCIAL_DUO_ENABLED`, and
          `SOCIAL_ADMIN_ENABLED` as each surface is ready.
        </CardContent>
      </Card>
      <SocialSurface capabilities={capabilities} />
    </div>
  );
}
