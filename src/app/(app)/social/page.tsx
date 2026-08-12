import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SocialSurface } from "@/features/social/social-surface";
import { isFeatureEnabled } from "@/lib/feature-flags";

export default function SocialPage() {
  if (!isFeatureEnabled("socialEnabled")) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Social is not enabled yet</CardTitle>
          <CardDescription>
            Social surfaces are staged behind `SOCIAL_ENABLED`.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <SocialSurface />;
}
