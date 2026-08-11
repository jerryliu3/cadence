"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationSettings } from "@/features/settings/notification-settings";

export function NotificationsSection() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Configure push access and reminder schedules.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NotificationSettings />
      </CardContent>
    </Card>
  );
}
