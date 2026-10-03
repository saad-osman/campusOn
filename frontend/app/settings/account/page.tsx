"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCurrentUser, useLogout } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useNotificationSettings } from "@/lib/engagement";
import { formatDate } from "@/lib/format";
import { useTrackRoute } from "@/lib/state";
import { useWorkspaces } from "@/lib/workspaces";

const TITLE = "font-heading text-base";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const [show, setShow] = React.useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordCard() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ current?: string; next?: string; confirm?: string }>({});
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!current) errs.current = "Enter your current password.";
    if (next.length < 8) errs.next = "Use at least 8 characters.";
    else if (next.length > 128) errs.next = "Use 128 characters or fewer.";
    if (confirm !== next) errs.confirm = "This doesn't match the new password.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await api.patch("/api/auth/password", { current_password: current, new_password: next });
      toast.success("Password changed.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setErrors({ current: err.message });
      else if (err instanceof ApiError && err.status === 422) setErrors({ next: "Use 8 to 128 characters." });
      else toast.error(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className={TITLE}>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" error={errors.current} />
          <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" error={errors.next} hint="At least 8 characters." />
          <PasswordField id="pw-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={errors.confirm} />
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Saving…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const { data: notif } = useNotificationSettings();
  const [deleting, setDeleting] = React.useState(false);
  useTrackRoute("/settings/account");

  async function exportData() {
    const data = await api.get("/api/settings/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lodestar-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api.delete("/api/settings/account");
      queryClient.clear();
      toast.success("Account deleted.");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete account.");
    } finally {
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className={TITLE}>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd>
              <span className="break-all">{user.email}</span>
              <span className="block text-xs text-muted-foreground">Your sign-in email can&apos;t be changed here yet.</span>
            </dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant="secondary" className="capitalize">
                {user.role}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd>{formatDate(user.created_at.slice(0, 10))}</dd>
          </dl>
          <Button variant="secondary" className="self-start" onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/") })}>
            Log out
          </Button>
        </CardContent>
      </Card>

      <PasswordCard />

      <Card>
        <CardHeader>
          <CardTitle className={TITLE}>Application Files you can access</CardTitle>
          <CardDescription>Who can see and edit each file is managed in its Team tab.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {wsLoading ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : !workspaces?.length ? (
            <p className="text-muted-foreground">
              You&apos;re not in any Application Files yet.{" "}
              <Link href="/files" className="font-medium text-foreground underline underline-offset-2">
                Create one
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {workspaces.map((ws) => (
                <li key={ws.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link href={`/files/${ws.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline">
                    {ws.name}
                  </Link>
                  <Badge variant="secondary" className="capitalize">
                    {ws.my_role}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {ws.member_count} member{ws.member_count === 1 ? "" : "s"}
                  </span>
                  <Link href={`/files/${ws.id}?tab=team`} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    Manage access
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={TITLE}>Connected services</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Send className="size-4 text-muted-foreground" aria-hidden />
            Telegram
            <Badge variant="secondary">{notif?.telegram_connected ? "Connected" : "Not connected"}</Badge>
          </span>
          <Link href="/settings/notifications#telegram" className="text-sm underline-offset-2 hover:underline">
            Manage in Notifications
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={TITLE}>Your data</CardTitle>
          <CardDescription>Download everything Lodestar has stored about you.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={exportData}>
            Download my data (JSON)
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className={`${TITLE} text-destructive`}>Danger zone</CardTitle>
          <CardDescription>Deletes your profile, CV text, and personal data. This cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete my account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your profile, CV text, saved opportunities, outcomes and notifications.
                  Application Files only you belong to are deleted; shared files you own pass to the teammate who joined
                  first. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  );
}
