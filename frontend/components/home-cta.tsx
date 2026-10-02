"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth";

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
  // Same height as the buttons, so nothing shifts when the session resolves.
  if (isLoading) return <div className="h-11" aria-hidden />;
  if (user) {
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
    <div className="flex flex-col items-start gap-3">
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
