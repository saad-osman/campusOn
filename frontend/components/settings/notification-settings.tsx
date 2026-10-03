"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/lib/auth";
import { parseServerTime } from "@/lib/format";
import {
  useDisconnectTelegram,
  useNotificationSettings,
  usePatchNotificationSettings,
  useTelegramCode,
} from "@/lib/engagement";
import type { NotificationSettings as Settings } from "@/lib/types";

function PrefRow({ id, label, hint, checked, available = true, badge, onChange }: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  /** False when the channel can't deliver yet: the switch shows OFF and can't be changed. */
  available?: boolean;
  /** Short reason shown beside the label when unavailable. */
  badge?: React.ReactNode;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id} className="text-sm">{label}</Label>
          {!available && badge}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {/* Display only: an unavailable channel reads OFF, but its stored preference is left as is. */}
      <Switch id={id} checked={checked && available} disabled={!available} onCheckedChange={onChange} />
    </div>
  );
}

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

function MutedBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{children}</span>;
}

export function NotificationSettingsCard() {
  const { data } = useNotificationSettings();
  const patch = usePatchNotificationSettings();
  const set = async (key: keyof Settings["prefs"], value: boolean) => {
    await patch.mutateAsync({ [key]: value });
    toast.success("Preferences saved");
  };
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-muted" aria-hidden />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Notifications</CardTitle>
        <CardDescription>In-app notifications are always on. Choose what else reaches you.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <p className={SECTION_LABEL}>What we notify you about</p>
          <PrefRow id="pref-changes" label="Change alerts" hint="When a saved or tracked opportunity changes (deadline, funding, eligibility)"
            checked={data.prefs.change_alerts} onChange={(v) => set("change_alerts", v)} />
          <PrefRow id="pref-endorse" label="Faculty recommendations" hint="When faculty endorse something for students like you"
            checked={data.prefs.endorsements} onChange={(v) => set("endorsements", v)} />
        </div>
        <div className="flex flex-col gap-4">
          <p className={SECTION_LABEL}>Where we send digests</p>
          <PrefRow id="pref-email" label="Weekly digest by email"
            hint={data.email_available ? "New matches, deadlines this week and changes" : "Email isn't configured on this server yet"}
            checked={data.prefs.email_digest} available={data.email_available}
            badge={<MutedBadge>Not set up</MutedBadge>}
            onChange={(v) => set("email_digest", v)} />
          <PrefRow id="pref-telegram" label="Weekly digest on Telegram"
            hint={data.telegram_connected ? "Sent to your connected chat" : "Link your Telegram chat to turn this on"}
            checked={data.prefs.telegram_digest} available={data.telegram_connected}
            badge={
              <a href="#telegram" className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Connect Telegram first
              </a>
            }
            onChange={(v) => set("telegram_digest", v)} />
        </div>
      </CardContent>
    </Card>
  );
}

export function TelegramCard() {
  const { data } = useNotificationSettings();
  const { data: user } = useCurrentUser();
  const createCode = useTelegramCode();
  const disconnect = useDisconnectTelegram();
  const [code, setCode] = React.useState<{ code: string; expires_at: string; bot_username: string | null } | null>(null);
  if (!data) return null;
  const bot = code?.bot_username ?? data.telegram_bot_username;
  return (
    <Card id="telegram" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <Send className="size-4" aria-hidden /> Telegram
        </CardTitle>
        <CardDescription>
          Get your digest and ask for <code>/matches</code> or <code>/deadlines</code> from a Telegram chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {data.telegram_connected ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-emerald-700 dark:text-emerald-400">Connected</span>
            <Button variant="outline" size="sm" onClick={async () => {
              await disconnect.mutateAsync();
              toast.success("Telegram disconnected");
            }}>
              Disconnect
            </Button>
          </div>
        ) : (
          <>
            {!data.telegram_available &&
              (user?.role === "admin" ? (
                <p className="text-xs text-muted-foreground">
                  The bot isn&apos;t running on this server (no <code>TELEGRAM_BOT_TOKEN</code>). You can still generate a code to
                  see how linking works.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Telegram alerts aren&apos;t available on this server yet. You can still try the linking flow.
                </p>
              ))}
            {code ? (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p>
                  Send this to {bot ? <a className="font-medium underline" href={`https://t.me/${bot}`} target="_blank" rel="noopener noreferrer">@{bot}</a> : "the Lodestar bot"}:
                </p>
                <p className="my-2 font-mono text-lg font-semibold tracking-wider">/start {code.code}</p>
                <p className="text-xs text-muted-foreground">
                  Valid until {parseServerTime(code.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, single use.
                </p>
              </div>
            ) : null}
            <Button
              variant="secondary"
              className="self-start"
              disabled={createCode.isPending}
              onClick={async () => setCode(await createCode.mutateAsync())}
            >
              {code ? "Generate a new code" : "Connect Telegram"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
