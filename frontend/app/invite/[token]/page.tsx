"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentUser } from "@/lib/auth";
import { useAcceptInvite, useInvitePreview } from "@/lib/workspaces";
import { ApiError } from "@/lib/api";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: preview, isLoading, error } = useInvitePreview(token);
  const accept = useAcceptInvite();
  const [acceptError, setAcceptError] = React.useState<string | null>(null);

  async function onAccept() {
    setAcceptError(null);
    try {
      await accept.mutateAsync(token);
      router.push("/files");
    } catch (err) {
      setAcceptError(err instanceof ApiError ? err.message : "Could not accept this invite.");
    }
  }

  if (isLoading || userLoading) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  if (error || !preview) {
    return (
      <div className="mx-auto max-w-sm py-16">
        <Alert variant="destructive">
          <AlertDescription>This invite link is invalid.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="text-2xl">{preview.workspace_icon}</span>
            {preview.workspace_name}
          </CardTitle>
          <CardDescription>
            {preview.invited_by_name} invited you as {preview.role === "editor" ? "an editor" : "a viewer"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {preview.already_accepted ? (
            <Alert>
              <AlertDescription>This invite has already been used.</AlertDescription>
            </Alert>
          ) : preview.expired ? (
            <Alert variant="destructive">
              <AlertDescription>This invite has expired. Ask for a new link.</AlertDescription>
            </Alert>
          ) : !user ? (
            <>
              <p className="text-sm text-muted-foreground">Log in or create an account to accept.</p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link href={`/login?next=/invite/${token}`}>Log in</Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/register?next=/invite/${token}`}>Register</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              {acceptError && (
                <Alert variant="destructive">
                  <AlertDescription>{acceptError}</AlertDescription>
                </Alert>
              )}
              <Button onClick={onAccept} disabled={accept.isPending}>
                {accept.isPending ? "Joining…" : `Join as ${user.name}`}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
