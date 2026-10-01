"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth";

export function HomeCTA() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <div className="h-10" aria-hidden />;
  if (user) {
    return (
      <Button size="lg" asChild className="h-11 px-5">
        <Link href="/dashboard">
          Open your dashboard <ArrowRight />
        </Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" asChild className="h-11 px-5">
          <Link href="/register">
            Get started free <ArrowRight />
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild className="h-11 px-5">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Trying the demo? Log in as <code className="rounded bg-muted px-1">student@demo.com</code> with password{" "}
        <code className="rounded bg-muted px-1">demo1234</code>.
      </p>
    </div>
  );
}
