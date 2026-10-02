"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CalendarClock, FileText, Folder, FolderOpen, MapPin, Search, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BentoAction, BentoCell, BentoGrid, BentoHeader } from "@/components/bento/bento";
import { filterChips } from "@/components/discover/filters";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { EligibilityPill } from "@/components/opportunity/eligibility-badge";
import { MatchScore } from "@/components/opportunity/match-score";
import { useRequireUser } from "@/lib/auth";
import { useEndorsedForMe, useNotifications } from "@/lib/engagement";
import { daysUntil, formatDate, timeAgo, TYPE_LABELS } from "@/lib/format";
import { EMPTY_FILTERS, useOpportunities, useSavedOpportunities, useTopMatches } from "@/lib/opportunities";
import { useProfile } from "@/lib/profile";
import { useTrackRoute, useUserState } from "@/lib/state";
import { useDocument, useWorkspace, useWorkspaces } from "@/lib/workspaces";
import type { Opportunity, SearchFilters } from "@/lib/types";

const HONORIFICS = /^(dr|prof|mr|mrs|ms|mx|sir|eng)\.?$/i;

/** "Dr. Fatima Al Mansouri" -> "Fatima", "Sara Student" -> "Sara". */
function firstName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.find((p) => !HONORIFICS.test(p)) ?? name;
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
      className="-mx-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

/** Hero: the single best match, with its score as the headline number. */
function TopMatchHero({ opp }: { opp: Opportunity }) {
  const days = daysUntil(opp.deadline);
  return (
    <BentoCell span={4} variant="hero" order="first" href={`/opportunities/${opp.id}`} label={`Top match: ${opp.title}`}>
      <p className="flex items-center gap-2 text-sm text-hero-muted">
        <Target className="size-4" aria-hidden /> Your top match
      </p>
      <p className="font-heading text-5xl font-semibold tabular-nums tracking-tight text-gold">
        {opp.match?.score}
        <span className="sr-only"> out of 100</span>
      </p>
      <div className="mt-auto flex flex-col gap-1">
        <p className="font-heading text-base font-semibold leading-snug tracking-tight">{opp.title}</p>
        <p className="line-clamp-1 text-sm text-hero-muted">
          {opp.match?.reasons[0]}
          {days !== null && days >= 0 ? ` · ${days} days left` : ""}
        </p>
      </div>
    </BentoCell>
  );
}

/** Hero fallback when there are no matches yet: the nearest saved deadline. */
function DeadlineHero({ opp }: { opp: Opportunity }) {
  const days = daysUntil(opp.deadline) ?? 0;
  return (
    <BentoCell span={4} variant="hero" order="first" href={`/opportunities/${opp.id}`} label={`Next deadline: ${opp.title}`}>
      <p className="flex items-center gap-2 text-sm text-hero-muted">
        <CalendarClock className="size-4" aria-hidden /> Your next deadline
      </p>
      <p className="font-heading text-5xl font-semibold tabular-nums tracking-tight text-gold">
        {days}
        <span className="ml-2 font-sans text-sm font-normal tracking-normal text-hero-muted">day{days === 1 ? "" : "s"} left</span>
      </p>
      <div className="mt-auto flex flex-col gap-1">
        <p className="font-heading text-base font-semibold leading-snug tracking-tight">{opp.title}</p>
        <p className="text-sm text-hero-muted">Closes {formatDate(opp.deadline)}</p>
      </div>
    </BentoCell>
  );
}

function ContinueCell() {
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
      <Link key="doc" href={`/files/${workspace.id}/docs/${doc.id}`} className="group flex gap-3 rounded-lg border p-3 transition-colors hover:border-foreground/20">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            in {workspace.name} · edited {timeAgo(doc.updated_at)}
          </p>
          {preview && <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{preview}”</p>}
        </div>
        <ArrowRight className="size-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </Link>
    );
  } else if (workspace) {
    items.push(
      <Link key="ws" href={`/files/${workspace.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-foreground/20">
        <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{workspace.name}</p>
          <p className="text-xs text-muted-foreground">Application File · {workspace.document_count} documents</p>
        </div>
      </Link>
    );
  }
  if (chips.length || discover?.q) {
    items.push(
      <Link key="search" href="/discover" className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:border-foreground/20">
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
    <BentoCell span={6} label="Continue where you left off">
      <BentoHeader icon={ArrowRight} title="Continue where you left off" />
      {items.length ? (
        <div className="flex flex-col gap-2">{items}</div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing to resume yet. Open an Application File or run a search and it&apos;ll be waiting here next time.
        </p>
      )}
    </BentoCell>
  );
}

function GreetingCell({ name, profileReady, span }: { name: string; profileReady: boolean; span: 8 | 12 }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  return (
    <BentoCell span={span} label="Welcome" className="justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{name}</h1>
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
        <p className="text-sm">
          <Link href="/onboarding" className="font-medium underline underline-offset-2">Finish your profile</Link>
          <span className="text-muted-foreground"> to unlock eligibility verdicts and match scores.</span>
        </p>
      )}
    </BentoCell>
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
  const upcoming = (saved.data ?? [])
    .filter((o) => {
      const d = daysUntil(o.deadline);
      return d !== null && d >= 0;
    })
    .sort((a, b) => (daysUntil(a.deadline) ?? 0) - (daysUntil(b.deadline) ?? 0));
  const dueSoon = upcoming.filter((o) => (daysUntil(o.deadline) ?? 99) <= 7);
  const regional = [...(nearYou.data ?? []), ...(gcc.data ?? [])]
    .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .slice(0, 4);
  const activeFiles = (workspaces ?? []).filter((w) => !w.archived);

  // Hero: best match if there is one, else the nearest saved deadline, else none.
  const bestMatch = profileReady ? top.data?.[0] : undefined;
  const heroLoading = profileReady && top.isLoading;
  const hero = bestMatch ? (
    <TopMatchHero opp={bestMatch} />
  ) : heroLoading ? (
    <BentoCell span={4} variant="hero" order="first" label="Loading your top match">
      <div className="h-full min-h-24 animate-pulse rounded-lg bg-hero-foreground/10" aria-hidden />
    </BentoCell>
  ) : upcoming[0] ? (
    <DeadlineHero opp={upcoming[0]} />
  ) : null;
  // The hero shows the best match, so the list starts from the next one (unless it's the only one).
  const otherMatches = (bestMatch && (top.data?.length ?? 0) > 1 ? top.data!.slice(1) : top.data ?? []).slice(0, 4);

  return (
    <BentoGrid>
      <GreetingCell name={firstName(user.name)} profileReady={profileReady} span={hero ? 8 : 12} />
      {hero}

      <ContinueCell />

      <BentoCell span={3} label="Deadlines this week" className={cn(dueSoon.length > 0 && "border-rose-500/30")}>
        <BentoHeader icon={CalendarClock} title="Deadlines this week" action={<BentoAction href="/discover">View all</BentoAction>} />
        {saved.isLoading ? (
          <TileSkeleton rows={2} />
        ) : dueSoon.length ? (
          <ul className="flex flex-col gap-2">
            {dueSoon.slice(0, 3).map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="block rounded-md hover:underline">
                  <span className="line-clamp-1 text-sm font-medium">{o.title}</span>
                </Link>
                <DeadlineBadge deadline={o.deadline} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            None of your {saved.data?.length ?? 0} saved opportunities close in the next 7 days.
          </p>
        )}
      </BentoCell>

      <BentoCell span={3} order="late" label="Application Files">
        <BentoHeader icon={FolderOpen} title="Application Files" action={<BentoAction href="/files">All files</BentoAction>} />
        {activeFiles.length ? (
          <ul className="flex flex-col gap-1">
            {activeFiles.slice(0, 3).map((w) => (
              <li key={w.id}>
                <Link href={`/files/${w.id}`} className="-mx-1.5 flex flex-col rounded-lg p-1.5 hover:bg-muted/60">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {w.member_count} member{w.member_count === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/files" className="underline">Create an Application File</Link> to track applications with teammates.
          </p>
        )}
      </BentoCell>

      <BentoCell span={6} rows={2} label="Top matches for you">
        <BentoHeader
          icon={Target}
          title="Top matches for you"
          action={<BentoAction href="/discover">See all</BentoAction>}
        />
        {!profileReady ? (
          <p className="text-sm text-muted-foreground">
            Matches are ranked against your profile.{" "}
            <Link href="/onboarding" className="underline">Upload your CV</Link> to get started.
          </p>
        ) : top.isLoading ? (
          <TileSkeleton rows={4} />
        ) : !otherMatches.length ? (
          <p className="text-sm text-muted-foreground">No matches yet. Check back after the next scrape.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {otherMatches.map((o) => (
              <div key={o.id} className="flex flex-col">
                <MiniOpportunity opp={o} />
                {o.eligibility_check && o.eligibility_check.verdict !== "eligible" && (
                  <EligibilityPill verdict={o.eligibility_check.verdict} className="mb-1 ml-12 w-fit" />
                )}
              </div>
            ))}
          </div>
        )}
      </BentoCell>

      <BentoCell span={6} label="Near you: UAE and GCC">
        <BentoHeader icon={MapPin} title="Near you: UAE & GCC" />
        {nearYou.isLoading ? (
          <TileSkeleton rows={2} />
        ) : regional.length ? (
          <div className="flex flex-col gap-1">
            {regional.map((o) => (
              <MiniOpportunity key={o.id} opp={o} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No regional opportunities open right now.</p>
        )}
      </BentoCell>

      <BentoCell span={6} label="Recommended by faculty">
        <BentoHeader icon={Sparkles} title="Recommended by faculty" />
        {endorsed.isLoading ? (
          <TileSkeleton rows={2} />
        ) : endorsed.data?.length ? (
          <div className="flex flex-col gap-1">
            {endorsed.data.slice(0, 3).map((o) => (
              <div key={o.id}>
                <MiniOpportunity opp={o} />
                {o.endorsements[0]?.note && (
                  <p className="ml-12 line-clamp-1 text-xs text-honor">
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
      </BentoCell>

      <BentoCell span={12} order="last" label="Notifications">
        <BentoHeader icon={Bell} title="Notifications" />
        {!notifications.data ? (
          <TileSkeleton rows={2} />
        ) : notifications.data.items.length ? (
          <ul className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
            {notifications.data.items.slice(0, 4).map((n) => (
              <li key={n.id} className="min-w-0">
                <Link
                  href={n.link ?? "#"}
                  className={cn("-mx-2 flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted/60", !n.read && "font-medium")}
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
      </BentoCell>
    </BentoGrid>
  );
}
