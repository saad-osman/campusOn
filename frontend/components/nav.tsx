"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  ChartColumn,
  CheckCheck,
  ClipboardCheck,
  Columns3,
  Compass,
  Folder,
  GraduationCap,
  LayoutDashboard,
  Menu,
} from "lucide-react";
import { LodestarWordmark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth";
import { useCompare } from "@/lib/compare";
import { useMarkRead, useNotifications } from "@/lib/engagement";
import type { User } from "@/lib/types";

type NavLink = { href: string; label: string; icon: React.ElementType };

function linksFor(user: User | null | undefined): NavLink[] {
  if (!user) return [];
  const links: NavLink[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/discover", label: "Discover", icon: Compass },
    { href: "/compare", label: "Compare", icon: Columns3 },
    { href: "/professors", label: "Professors", icon: GraduationCap },
    { href: "/files", label: "Files", icon: Folder },
  ];
  if (user.role === "faculty" || user.role === "admin") {
    links.push(
      { href: "/faculty/review", label: "Review", icon: ClipboardCheck },
      { href: "/faculty/endorse", label: "Endorse", icon: BadgeCheck }
    );
  }
  if (user.role === "admin") links.push({ href: "/admin", label: "Admin", icon: ChartColumn });
  return links;
}

/** Icon + label (+ the compare count) inside a nav link; the icon inherits the text colour. */
function LinkContent({ link, compareCount }: { link: NavLink; compareCount: number }) {
  const Icon = link.icon;
  return (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      {link.label}
      {link.href === "/compare" && compareCount > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
          aria-label={`${compareCount} selected`}
        >
          {compareCount}
        </span>
      )}
    </>
  );
}

function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const router = useRouter();
  const unread = data?.unread_count ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate("all")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-4" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!data?.items.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing yet. Save opportunities to get alerts when they change.
            </p>
          ) : (
            data.items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn("flex flex-col items-start gap-0.5 rounded-none border-b px-3 py-2 last:border-0", !n.read && "bg-primary/5")}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (n.link) router.push(n.link);
                }}
              >
                <span className="flex w-full items-start gap-2">
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                  <span className="text-sm font-medium leading-snug">{n.title}</span>
                </span>
                {n.body && n.type !== "digest" && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DemoBanner() {
  const { data } = useQuery<{ demo_mode: boolean }>({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data?.demo_mode) return null;
  return (
    <div className="border-b border-gold/40 bg-accent px-4 py-1 text-center text-xs text-accent-foreground">
      <strong>Demo mode:</strong> no AI key configured, so extraction and drafts use built-in rules and templates.
    </div>
  );
}

export function Nav() {
  const { data: user, isLoading } = useCurrentUser();
  const pathname = usePathname();
  // The home page is the landing page: just the logo and theme toggle; its own CTAs lead on.
  const onHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const links = onHome ? [] : linksFor(user);
  const compareCount = useCompare().ids.length;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // Publish the sticky header's height (it includes the demo banner) as --header-h, for panels that stick below it.
  const headerRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <DemoBanner />
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          {links.length > 0 && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetHeader>
                  <SheetTitle>
                    <LodestarWordmark />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-2" aria-label="Main">
                  {links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={isActive(link.href) ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm hover:bg-muted",
                        isActive(link.href) && "bg-muted font-medium"
                      )}
                    >
                      <LinkContent link={link} compareCount={compareCount} />
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          )}
          <Link href={user ? "/dashboard" : "/"} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LodestarWordmark />
          </Link>
        </div>
        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                isActive(link.href) && "bg-muted font-medium text-foreground"
              )}
            >
              <LinkContent link={link} compareCount={compareCount} />
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Nothing on Home. `undefined` = the session check failed (server asleep): show neither state yet. */}
          {onHome || isLoading || user === undefined ? null : user ? (
            <>
              <NotificationBell />
              <AccountMenu user={user} />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
