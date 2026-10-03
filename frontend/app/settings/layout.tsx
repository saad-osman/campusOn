"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ShieldCheck, UserRound } from "lucide-react";
import { useRequireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings/profile", label: "Profile", icon: UserRound },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/account", label: "Account & access", icon: ShieldCheck },
] as const;

/** Settings shell: title, then a sticky left nav on desktop (a tab row below lg) beside the section's cards. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user, isLoading } = useRequireUser(pathname || "/settings");

  if (isLoading || !user) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  const link = (s: (typeof SECTIONS)[number], variant: "side" | "tab") => {
    const active = pathname === s.href;
    return (
      <Link
        key={s.href}
        href={s.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          variant === "side" ? "px-3 py-2" : "shrink-0 px-3 py-1.5",
          active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <s.icon className="size-4" aria-hidden />
        {s.label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="truncate text-sm text-muted-foreground">
          {user.name} &middot; {user.email}
        </p>
      </div>

      {/* Below lg: a scrollable tab row. */}
      <nav aria-label="Settings sections" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b px-4 pb-2 lg:hidden">
        {SECTIONS.map((s) => link(s, "tab"))}
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="sticky top-[calc(var(--header-h,57px)+1rem)] hidden w-56 flex-col gap-1 self-start rounded-xl border bg-sidebar p-2 text-sidebar-foreground lg:flex"
        >
          {SECTIONS.map((s) => link(s, "side"))}
        </nav>
        <div className="flex min-w-0 max-w-2xl flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
