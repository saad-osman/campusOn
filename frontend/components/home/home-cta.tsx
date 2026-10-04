"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useSessionHint } from "@/lib/auth";
import { HINT_PENDING_HIDE } from "@/lib/session-hint";
import { cn } from "@/lib/utils";

/** Text-style secondary CTA (logged-out visitors go via login, then land on Discover). */
function BrowseLink() {
  return (
    <Link
      href="/discover"
      className="inline-flex h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Browse opportunities <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

export function HomeCTA() {
  const { data: user, isLoading } = useCurrentUser();
  const hint = useSessionHint();
  // Always show buttons: while the session is unknown (loading, or the API is asleep and the
  // check failed) the readable hint cookie picks the set; the session's own answer wins once
  // it loads. The pages they lead to show the "Waking up the server" card if needed.
  const signedIn = isLoading || user === undefined ? hint === true : !!user;
  if (signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button size="lg" asChild className="h-11 px-5">
          <Link href="/dashboard">
            Open your dashboard <ArrowRight />
          </Link>
        </Button>
        <BrowseLink />
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-start gap-3", hint === null && HINT_PENDING_HIDE)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button size="lg" asChild className="h-11 px-5">
          <Link href="/register">
            Get started free <ArrowRight />
          </Link>
        </Button>
        <BrowseLink />
      </div>
      <p className="text-xs text-muted-foreground">Demo login: student@demo.com &middot; demo1234</p>
    </div>
  );
}
