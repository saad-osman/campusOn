"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import { useTrackRoute, useUserState } from "@/lib/state";

export default function DashboardPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: profile } = useProfile();
  const { data: state } = useUserState();

  React.useEffect(() => {
    if (!userLoading && !user) router.replace("/login?next=/dashboard");
  }, [user, userLoading, router]);

  // Track that the dashboard is where they last were (Section 4.2).
  useTrackRoute("/dashboard");

  if (userLoading || !user) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  const hasResumePoint = state && state.last_route && state.last_route !== "/dashboard";

  return (
    <div className="flex flex-col gap-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Here&apos;s where things stand.</p>
      </div>

      {profile && !profile.onboarding_complete && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Finish setting up your profile</CardTitle>
            <CardDescription>
              A few more details will let us show eligibility and match scores for every
              opportunity (coming in a later phase of this build).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/onboarding">Continue onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {hasResumePoint && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Continue where you left off</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm">{state!.last_route}</p>
              {state!.last_workspace_id && (
                <p className="text-xs text-muted-foreground">
                  Workspace: {state!.last_workspace_id}
                </p>
              )}
            </div>
            <Button variant="secondary" asChild>
              <Link href={state!.last_route!}>Resume</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top matches for you</CardTitle>
            <Badge variant="outline" className="w-fit">coming in a later phase</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Once the matching engine lands, your best-fit opportunities will show up here.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deadlines this week</CardTitle>
            <Badge variant="outline" className="w-fit">coming in a later phase</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Opportunities you&apos;ve saved with deadlines in the next 7 days will appear here.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
