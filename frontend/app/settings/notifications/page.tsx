"use client";

import { NotificationSettingsCard, TelegramCard } from "@/components/settings/notification-settings";
import { useTrackRoute } from "@/lib/state";

export default function NotificationSettingsPage() {
  useTrackRoute("/settings/notifications");
  return (
    <>
      <NotificationSettingsCard />
      <TelegramCard />
    </>
  );
}
