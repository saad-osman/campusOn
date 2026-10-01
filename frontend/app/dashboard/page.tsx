"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CalendarClock, FileText, FolderOpen, MapPin, Search, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { filterChips } from "@/components/discover/filters";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { EligibilityPill } from "@/components/opportunity/eligibility-badge";
import { MatchScore } from "@/components/opportunity/match-score";
import { useRequireUser } from "@/lib/auth";
import { useEndorsedForMe, useNotifications } from "@/lib/engagement";
import { daysUntil, timeAgo, TYPE_LABELS } from "@/lib/format";
import { EMPTY_FILTERS, useOpportunities, useSavedOpportunities, useTopMatches } from "@/lib/opportunities";
import { useProfile } from "@/lib/profile";
import { useTrackRoute, useUserState } from "@/lib/state";
import { useDocument, useWorkspace, useWorkspaces } from "@/lib/workspaces";
import type { Opportunity, SearchFilters } from "@/lib/types";

function Tile({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5 shadow-xs", className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-primary" aria-hidden />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function TileSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function MiniOpportunity({ opp, showScore = true }: { opp: Opportunity; showScore?: boolean }) {
  return (
    <Link
      href={`/opportunities/${opp.id}`}
      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {showScore && opp.match && <MatchScore score={opp.match.score} size={38} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{opp.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {opp.match?.reasons[0] ?? `${TYPE_LABELS[opp.type]} · ${opp.organization}`}
        </p>
      </div>
      <DeadlineBadge deadline={opp.deadline} className="hidden shrink-0 sm:inline-flex" />
    </Link>
  );
}

function ContinueTile() {
  const { data: state } = useUserState();
  const { data: workspace } = useWorkspace(state?.last_workspace_id ?? undefined);
  const { data: doc } = useDocument(state?.last_document_id ?? undefined);
  const discover = (state?.ui_state?.discover ?? null) as { q?: string; filters?: SearchFilters } | null;
  const chips = discover?.filters ? filterChips({ ...EMPTY_FILTERS, ...discover.filters }) : [];
  const preview = doc?.content
    .split("\n")
    // Plain-text preview: drop Markdown list/heading/quote markers and the AI-draft label.
    .map((l) => l.trim().replace(/^([-*] \[[ xX]\]\s*|#+\s*|>\s*|[-*]\s+)/, "").replace(/\*\*/g, ""))
    .filter((l) => l && !l.startsWith("AI draft"))
    .slice(-2)
    .join(" · ");

  const items: React.ReactNode[] = [];
  if (doc && workspace) {
    items.push(
      <Link key="doc" href={`/files/${workspace.id}/docs/${doc.id}`} className="group flex gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            in {workspace.icon} {workspace.name} · edited {timeAgo(doc.updated_at)}
          </p>
          {preview && <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{preview}”</p>}
        </div>
        <ArrowRight className="size-4 shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </Link>
    );
  } else if (workspace) {
    items.push(
      <Link key="ws" href={`/files/${workspace.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40">
        <span className="text-xl" aria-hidden>{workspace.icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{workspace.name}</p>
          <p className="text-xs text-muted-foreground">Application File · {workspace.document_count} documents</p>
        </div>
      </Link>
    );
  }
  if (chips.length || discover?.q) {
    items.push(
      <Link key="search" href="/discover" className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:border-primary/40">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Search className="size-4 text-muted-foreground" aria-hidden /> Your last search
        </span>
        <span className="flex flex-wrap gap-1">
          {(chips.length ? chips.map((c) => c.label) : [discover?.q ?? ""]).slice(0, 6).map((label) => (
            <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-xs">{label}</span>
          ))}
        </span>
      </Link>
    );
  }

  return (
    <Tile title="Continue where you left off" icon={ArrowRight} className="lg:col-span-2">
      {items.length ? (
        <div className="flex flex-col gap-2">{items}</div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing to resume yet. Open an Application File or run a search and it&apos;ll be waiting here next time.
        </p>
      )}
    </Tile>
  );
}

function SearchTile({ name, profileReady }: { name: string; profileReady: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  return (
    <section className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/12 via-card to-card p-5 shadow-xs lg:col-span-2">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      </div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/discover?q=${encodeURIComponent(q.trim())}` : "/discover");
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What are you looking for? e.g. robotics internships in the UAE"
          aria-label="Search opportunities"
          className="h-10 bg-background"
        />
        <Button type="submit" className="h-10">Search</Button>
      </form>
      {!profileReady && (
        <p className="text-xs">
          <Link href="/onboarding" className="font-medium underline underline-offset-2">Finish your profile</Link>
          <span className="text-muted-foreground"> to unlock eligibility verdicts and match scores.</span>
        </p>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { data: user, isLoading: userLoading } = useRequireUser("/dashboard");
  const { data: profile } = useProfile();
  const top = useTopMatches(5);
  const saved = useSavedOpportunities();
  const nearYou = useOpportunities({ region: "uae", sort: "match", limit: 4 });
  const gcc = useOpportunities({ region: "gcc", sort: "match", limit: 4 });
  const { data: workspaces } = useWorkspaces();
  const endorsed = useEndorsedForMe();
  const notifications = useNotifications();
  useTrackRoute("/dashboard");

  if (userLoading || !user) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  const profileReady = !!profile && (profile.onboarding_complete || !!profile.degree_level);
  const dueSoon = (saved.data ?? []).filter((o) => {
    const d = daysUntil(o.deadline);
    return d !== null && d >= 0 && d <= 7;
  });
  const regional = [...(nearYou.data ?? []), ...(gcc.data ?? [])]
    .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .slice(0, 4);
  const activeFiles = (workspaces ?? []).filter((w) => !w.archived);

  return (
    <div className="grid auto-rows-min gap-4 lg:grid-cols-4">
      <SearchTile name={user.name.split(" ")[0]} profileReady={profileReady} />
      <ContinueTile />

      <Tile
        title="Top matches for you"
        icon={Target}
        className="lg:col-span-2 lg:row-span-2"
        action={
          <Link href="/discover" className="text-xs text-muted-foreground hover:text-foreground">
            See all
          </Link>
        }
      >
        {!profileReady ? (
          <p className="text-sm text-muted-foreground">
            Matches are ranked against your profile.{" "}
            <Link href="/onboarding" className="underline">Upload your CV</Link> to get started.
          </p>
        ) : top.isLoading ? (
          <TileSkeleton rows={5} />
        ) : !top.data?.length ? (
          <p className="text-sm text-muted-foreground">No matches yet. Check back after the next scrape.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {top.data.map((o) => (
              <div key={o.id} className="flex flex-col">
                <MiniOpportunity opp={o} />
                {o.eligibility_check && o.eligibility_check.verdict !== "eligible" && (
                  <EligibilityPill verdict={o.eligibility_check.verdict} className="mb-1 ml-14 w-fit" />
                )}
              </div>
            ))}
          </div>
        )}
      </Tile>

      <Tile title="Deadlines this week" icon={CalendarClock} className={cn(dueSoon.length && "border-rose-500/30")}>
        {saved.isLoading ? (
          <TileSkeleton rows={2} />
        ) : dueSoon.length ? (
          <div className="flex flex-col gap-1">
            {dueSoon.map((o) => (
              <MiniOpportunity key={o.id} opp={o} showScore={false} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            None of your {saved.data?.length ?? 0} saved opportunities close in the next 7 days.
          </p>
        )}
      </Tile>

      <Tile
        title="Application Files"
        icon={FolderOpen}
        action={
          <Link href="/files" className="text-xs text-muted-foreground hover:text-foreground">
            All files
          </Link>
        }
      >
        {activeFiles.length ? (
          <ul className="flex flex-col gap-1">
            {activeFiles.slice(0, 3).map((w) => (
              <li key={w.id}>
                <Link href={`/files/${w.id}`} className="flex items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-muted/60">
                  <span aria-hidden>{w.icon}</span>
                  <span className="truncate">{w.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{w.member_count} 👤</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/files" className="underline">Create an Application File</Link> to track applications with teammates.
          </p>
        )}
      </Tile>

      <Tile title="Near you: UAE & GCC" icon={MapPin} className="lg:col-span-2">
        {nearYou.isLoading ? (
          <TileSkeleton rows={2} />
        ) : regional.length ? (
          <div className="grid gap-1 sm:grid-cols-2">
            {regional.map((o) => (
              <MiniOpportunity key={o.id} opp={o} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No regional opportunities open right now.</p>
        )}
      </Tile>

      <Tile title="Recommended by faculty" icon={Sparkles} className="lg:col-span-2">
        {endorsed.isLoading ? (
          <TileSkeleton rows={2} />
        ) : endorsed.data?.length ? (
          <div className="flex flex-col gap-1">
            {endorsed.data.slice(0, 3).map((o) => (
              <div key={o.id}>
                <MiniOpportunity opp={o} />
                {o.endorsements[0]?.note && (
                  <p className="ml-14 line-clamp-1 text-xs text-violet-700 dark:text-violet-300">
                    {o.endorsements[0].faculty_name}: &ldquo;{o.endorsements[0].note}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            When faculty recommend something for students like you, it shows up here.
          </p>
        )}
      </Tile>

      <Tile title="Notifications" icon={Bell} className="lg:col-span-2">
        {!notifications.data ? (
          <TileSkeleton rows={2} />
        ) : notifications.data.items.length ? (
          <ul className="flex flex-col gap-1">
            {notifications.data.items.slice(0, 4).map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? "#"}
                  className={cn("flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted/60", !n.read && "font-medium")}
                >
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">{timeAgo(n.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
        )}
      </Tile>
    </div>
  );
}
