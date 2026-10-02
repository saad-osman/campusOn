"use client";

import * as React from "react";
import Link from "next/link";
import { LodestarMark } from "@/components/brand/logo";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError } from "@/lib/api";

function RequestResetForm() {
  const [email, setEmail] = React.useState("");
  const [devLink, setDevLink] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await api.post<{ message: string; dev_reset_link?: string }>(
        "/api/auth/forgot-password",
        { email }
      );
      setSent(true);
      setDevLink(res.dev_reset_link ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <LodestarMark className="mb-2 size-10" />
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>We&apos;ll send a reset link to your email.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col gap-3 text-sm">
            <Alert>
              <AlertDescription>
                If that email is registered, a reset link has been created.
              </AlertDescription>
            </Alert>
            {devLink && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  No SMTP configured &mdash; here&apos;s your reset link (demo mode):
                </p>
                <Link href={devLink} className="break-all text-xs text-primary hover:underline">
                  {devLink}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="hover:underline">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post("/api/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <LodestarMark className="mb-2 size-10" />
        <CardTitle>Set a new password</CardTitle>
      </CardHeader>
      <CardContent>
        {done ? (
          <Alert>
            <AlertDescription>Password updated. Redirecting to log in&hellip;</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ForgotPasswordInner() {
  const params = useSearchParams();
  const token = params.get("token");

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-16">
      {token ? <ResetPasswordForm token={token} /> : <RequestResetForm />}
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ForgotPasswordInner />
    </React.Suspense>
  );
}
