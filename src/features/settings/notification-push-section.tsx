"use client";

import { Bell, BellOff, LoaderCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PushStatus =
  | "checking"
  | "unsupported"
  | "denied"
  | "unsubscribed"
  | "subscribed"
  | "subscription-error"
  | "not-configured";

interface NotificationPushSectionProps {
  pushStatus: PushStatus;
  pushSubscription: PushSubscription | null;
  changingPushStatus: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  onEnablePush: () => void;
  onDisablePush: () => void;
}

const pushStatusCopy: Record<PushStatus, string> = {
  checking: "Checking this device…",
  unsupported: "Push notifications are not available in this browser.",
  denied: "Notifications are blocked in this device's settings.",
  unsubscribed: "Push notifications are off on this device.",
  subscribed: "Push notifications are on for this device.",
  "subscription-error":
    "This browser is subscribed, but the server could not register this device.",
  "not-configured": "Push notifications have not been configured for this deployment.",
};

export function NotificationPushSection({
  pushStatus,
  pushSubscription,
  changingPushStatus,
  isIOS,
  isStandalone,
  onEnablePush,
  onDisablePush,
}: NotificationPushSectionProps) {
  const canEnablePush = pushStatus === "unsubscribed";

  return (
    <section className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-medium">
          <Bell className="size-5" />
          Push notifications
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable reminders on each device where you want to receive them.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">This device</p>
            <p className="text-sm text-muted-foreground">{pushStatusCopy[pushStatus]}</p>
          </div>
        </div>

        {pushSubscription ? (
          <Button
            type="button"
            variant="outline"
            onClick={onDisablePush}
            disabled={changingPushStatus}
          >
            {changingPushStatus ? <LoaderCircle className="animate-spin" /> : <BellOff />}
            Disable
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onEnablePush}
            disabled={!canEnablePush || changingPushStatus}
          >
            {changingPushStatus ? <LoaderCircle className="animate-spin" /> : <Bell />}
            Enable
          </Button>
        )}
      </div>

      {isIOS && !isStandalone ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          On iPhone or iPad, first use the browser Share menu to add Goalmaxxing to your Home
          Screen. Then open Goalmaxxing from its Home Screen icon and enable notifications here.
        </div>
      ) : null}

      {pushStatus === "denied" ? (
        <p className="text-sm text-muted-foreground">
          Open your device&apos;s notification settings, allow notifications for Goalmaxxing,
          then return here.
        </p>
      ) : null}
    </section>
  );
}
