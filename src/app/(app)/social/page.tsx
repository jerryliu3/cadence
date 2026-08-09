import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Social feed is rolling out</CardTitle>
        <CardDescription>
          Feed, challenges, leaderboards, and duo surfaces will appear as each
          phase is enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Turn on `SOCIAL_FEED_ENABLED`, `SOCIAL_CHALLENGES_ENABLED`,
        `SOCIAL_LEADERBOARDS_ENABLED`, and `SOCIAL_DUO_ENABLED` as each surface
        is ready.
      </CardContent>
    </Card>
  );
}
