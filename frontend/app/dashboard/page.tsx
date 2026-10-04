"use client";

/*
 * Student dashboard (DESIGN.md "Dashboard"): greeting + one hero, four stat cells, then
 * pairs of equal-height cells. No cell spans two rows, and opportunities are de-duplicated
 * across cells (hero -> Top matches -> Near you).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Bookmark,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Folder,
  FolderOpen,
  Info,
  MapPin,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trophy,
  UserPlus,
  MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BentoAction, BentoCell, BentoGrid, BentoHeader } from "@/components/bento/bento";
import { DeadlineTimeline } from "@/components/dashboard/deadline-timeline";
import { filterChips } from "@/components/discover/filters";
import { IconTile } from "@/components/icon-tile";
import { ReadinessMeter } from "@/components/workspace/readiness";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { EligibilityPill } from "@/components/opportunity/eligibility-badge";
import { MatchScore } from "@/components/opportunity/match-score";
import { useRequireUser } from "@/lib/auth";
import { useEndorsedForMe, useMarkRead, useNotifications } from "@/lib/engagement";
import { daysUntil, formatDate, initials, timeAgo } from "@/lib/format";
import { useCountUp } from "@/lib/motion";
import { EMPTY_FILTERS, useOpportunities, useSavedOpportunities, useTopMatches } from "@/lib/opportunities";
import { profileCompleteness, profileEditHref, useProfile } from "@/lib/profile";
import { useTrackRoute, useUserState } from "@/lib/state";
import { useDocument, useWorkspace, useWorkspaces } from "@/lib/workspaces";
import type { AppNotification, Opportunity, Profile, SearchFilters, Workspace } from "@/lib/types";

const HONORIFICS = /^(dr|prof|mr|mrs|ms|mx|sir|eng)\.?$/i;
const REGION_SEARCH = `/discover?q=${encodeURIComponent("opportunities in the UAE and GCC")}`;
const STRONG = 75;

/** "Dr. Fatima Al Mansouri" -> "Fatima", "Sara Student" -> "Sara". */
function firstName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.find((p) => !HONORIFICS.test(p)) ?? name;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Loading rows shaped like the final ones (score circle + two lines), so nothing jumps. */
function RowSkeleton({ rows = 3, score = true }: { rows?: number; score?: boolean }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {score && <div className="size-[38px] shrink-0 animate-pulse rounded-full bg-muted" />}
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, text, action }: { icon: React.ElementType; text: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-3">
      <IconTile icon={icon} />
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

/** One opportunity row: score, two-line title, then `sub` (reasons, organization...). */
function OpportunityRow({
  opp,
  index = 0,
  sub,
  aside,
}: {
  opp: Opportunity;
  index?: number;
  sub?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <Link
      href={`/opportunities/${opp.id}`}
      className="-mx-2 flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {opp.match && <MatchScore score={opp.match.score} size={38} delay={Math.min(index, 8) * 60 + 150} />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{opp.title}</p>
        {sub && <div className="mt-1">{sub}</div>}
      </div>
      {aside && <div className="flex shrink-0 flex-col items-end gap-1.5">{aside}</div>}
    </Link>
  );
}

function ReasonChips({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.slice(0, 2).map((r) => (
        <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {r}
        </span>
      ))}
    </span>
  );
}

/** Hero: the single best match, with its score as the headline number. */
function TopMatchHero({ opp }: { opp: Opportunity }) {
  const days = daysUntil(opp.deadline);
  return (
    <BentoCell span={4} variant="hero" href={`/opportunities/${opp.id}`} label={`Top match: ${opp.title}`}>
      <p className="flex items-center gap-2 text-sm text-hero-muted">
        <Target className="size-4" aria-hidden /> Your top match
      </p>
      <p className="font-heading text-5xl font-semibold tabular-nums tracking-tight text-gold">
        {opp.match?.score}
        <span className="sr-only"> out of 100</span>
      </p>
      <div className="mt-auto flex flex-col gap-1.5">
        <p className="font-heading text-base font-semibold leading-snug tracking-tight">{opp.title}</p>
        {opp.match?.reasons[0] && <p className="line-clamp-2 text-sm text-hero-muted">{opp.match.reasons[0]}</p>}
        {days !== null && days >= 0 && (
          <p className="flex items-center gap-1.5 text-sm text-hero-muted">
            <CalendarClock className="size-4" aria-hidden /> {days === 0 ? "Closes today" : `${plural(days, "day")} left`}
          </p>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gold">
          View opportunity <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </BentoCell>
  );
}

/** Hero fallback when there are no matches yet: the nearest saved deadline. */
function DeadlineHero({ opp }: { opp: Opportunity }) {
  const days = daysUntil(opp.deadline) ?? 0;
  return (
    <BentoCell span={4} variant="hero" href={`/opportunities/${opp.id}`} label={`Next deadline: ${opp.title}`}>
      <p className="flex items-center gap-2 text-sm text-hero-muted">
        <CalendarClock className="size-4" aria-hidden /> Your next deadline
      </p>
      <p className="font-heading text-5xl font-semibold tabular-nums tracking-tight text-gold">
        {days}
        <span className="ml-2 font-sans text-sm font-normal tracking-normal text-hero-muted">day{days === 1 ? "" : "s"} left</span>
      </p>
      <div className="mt-auto flex flex-col gap-1.5">
        <p className="font-heading text-base font-semibold leading-snug tracking-tight">{opp.title}</p>
        <p className="text-sm text-hero-muted">Closes {formatDate(opp.deadline)}</p>
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gold">
          View opportunity <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </BentoCell>
  );
}

function GreetingCell({
  name,
  span,
  summary,
  profile,
}: {
  name: string;
  span: 8 | 12;
  summary: string;
  profile: Profile | undefined;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const { percent } = profileCompleteness(profile);
  // Suggested searches from the student's own interests, else general starters.
  const interests = profile?.interests ?? [];
  const suggestions = interests.length
    ? interests.slice(0, 3).map((i, n) => `${i} ${["internships", "fellowships", "scholarships"][n]}`)
    : ["funded research internships", "scholarships in the UAE", "summer schools in Europe"];
  return (
    <BentoCell span={span} label="Welcome" className="gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="text-sm text-muted-foreground">{summary}</p>
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
        <Button type="submit" className="h-10">
          Search
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Try:</span>
          {suggestions.map((s) => (
            <Link
              key={s}
              href={`/discover?q=${encodeURIComponent(s)}`}
              className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {s}
            </Link>
          ))}
        </div>
      )}
      {profile && percent < 100 && (
        <Link href={profileEditHref(profile)} className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </span>
          <span className="text-sm">
            <span className="font-medium underline-offset-2 group-hover:underline">Complete your profile</span>
            <span className="text-muted-foreground"> · {percent}% done</span>
          </span>
        </Link>
      )}
    </BentoCell>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  sub,
  href,
  loading,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub: string;
  href: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <BentoCell span={3} href={href} label={`${label}: ${value}`} className={cn("gap-2", className)}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden /> {label}
      </p>
      {loading ? (
        <>
          <div className="h-10 w-14 animate-pulse rounded bg-muted" aria-hidden />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" aria-hidden />
        </>
      ) : (
        <>
          <StatNumber value={value} />
          <p className="text-xs text-muted-foreground">{sub}</p>
        </>
      )}
    </BentoCell>
  );
}

function StatNumber({ value }: { value: number }) {
  const shown = useCountUp(value, { duration: 900 });
  return <p className="font-heading text-4xl font-semibold tabular-nums tracking-tight">{Math.round(shown)}</p>;
}

function ContinueCell() {
  const { data: state, isLoading } = useUserState();
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
          <p className="text-xs text-muted-foreground">Application File · {plural(workspace.document_count, "document")}</p>
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
            <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {label}
            </span>
          ))}
        </span>
      </Link>
    );
  }

  return (
    <BentoCell span={8} label="Continue where you left off">
      <BentoHeader icon={ArrowRight} title="Continue where you left off" />
      {isLoading ? (
        <RowSkeleton rows={2} score={false} />
      ) : items.length ? (
        <div className="grid gap-2 lg:grid-cols-2">{items}</div>
      ) : (
        <EmptyState
          icon={ArrowRight}
          text="Nothing to resume yet. Open an Application File or run a search and it'll be waiting here next time."
          action={
            <Button asChild size="sm">
              <Link href="/discover">Explore opportunities</Link>
            </Button>
          }
        />
      )}
    </BentoCell>
  );
}

function FilesCell({ files, loading }: { files: Workspace[]; loading: boolean }) {
  return (
    <BentoCell span={4} label="Application Files">
      <BentoHeader icon={FolderOpen} title="Application Files" action={<BentoAction href="/files">All files</BentoAction>} />
      {loading ? (
        <RowSkeleton rows={3} score={false} />
      ) : files.length ? (
        <ul className="flex flex-col gap-1">
          {files.slice(0, 4).map((w) => (
            <li key={w.id}>
              <Link href={`/files/${w.id}`} className="-mx-2 flex flex-col gap-1 rounded-lg p-2 transition-colors hover:bg-muted/60">
                <span className="line-clamp-2 text-sm font-medium">{w.name}</span>
                {w.readiness && w.readiness.status !== "empty" && <ReadinessMeter readiness={w.readiness} compact />}
                <span className="flex items-center justify-between gap-2">
                  <span className="flex -space-x-1.5" aria-label={`Members: ${w.members.map((m) => m.name).join(", ")}`}>
                    {w.members.slice(0, 3).map((m) => (
                      <span
                        key={m.user_id}
                        title={m.name}
                        className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold"
                      >
                        {initials(m.name)}
                      </span>
                    ))}
                    {w.members.length > 3 && (
                      <span className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px]">
                        +{w.members.length - 3}
                      </span>
                    )}
                  </span>
                  {w.nearest_deadline && <DeadlineBadge deadline={w.nearest_deadline} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FolderOpen}
          text="Track an application with teammates: drafts, a checklist and a tracker in one place."
          action={
            <Button asChild size="sm">
              <Link href="/files">New Application File</Link>
            </Button>
          }
        />
      )}
    </BentoCell>
  );
}

const NOTIFICATION_ICONS: Record<AppNotification["type"], React.ElementType> = {
  invite: UserPlus,
  assignment: ClipboardCheck,
  change_alert: RefreshCw,
  endorsement: Sparkles,
  digest: Newspaper,
  outcome: Trophy,
  outreach: MailCheck,
  system: Info,
};

function NotificationsCell() {
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const items = notifications.data?.items.slice(0, 6) ?? [];
  const unread = notifications.data?.unread_count ?? 0;
  return (
    <BentoCell span={12} label="Notifications">
      <BentoHeader icon={Bell} title="Notifications" />
      {!notifications.data ? (
        <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
          <RowSkeleton rows={2} score={false} />
          <RowSkeleton rows={2} score={false} />
        </div>
      ) : items.length ? (
        <>
          <ul className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
            {items.map((n) => {
              const Icon = NOTIFICATION_ICONS[n.type] ?? Info;
              return (
                <li key={n.id} className="min-w-0">
                  <Link
                    href={n.link ?? "#"}
                    className={cn("-mx-2 flex items-start gap-2.5 rounded-lg p-2 text-sm transition-colors hover:bg-muted/60", !n.read && "font-medium")}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", n.read ? "text-muted-foreground" : "text-foreground")} aria-hidden />
                    <span className="min-w-0 flex-1 line-clamp-2">
                      {!n.read && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="flex flex-wrap items-center gap-x-2 border-t pt-3 text-xs text-muted-foreground">
            {unread ? (
              <>
                <span>{unread} unread</span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => markRead.mutate("all")}
                  disabled={markRead.isPending}
                  className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Mark all read
                </button>
              </>
            ) : (
              <span>All read</span>
            )}
          </p>
        </>
      ) : (
        <EmptyState
          icon={Bell}
          text="You're all caught up. Change alerts, invites and faculty recommendations appear here."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/settings/notifications">Notification settings</Link>
            </Button>
          }
        />
      )}
    </BentoCell>
  );
}

export default function DashboardPage() {
  const { data: user, isLoading: userLoading } = useRequireUser("/dashboard");
  const { data: profile } = useProfile();
  // 24 (the API maximum) so "Strong matches" counts them all; the list still shows 4.
  const top = useTopMatches(24);
  const saved = useSavedOpportunities();
  // 8 per region, so enough remain after removing the hero and Top matches.
  const nearYou = useOpportunities({ region: "uae", sort: "match", limit: 8 });
  const gcc = useOpportunities({ region: "gcc", sort: "match", limit: 8 });
  const { data: workspaces, isLoading: filesLoading } = useWorkspaces();
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
  const activeFiles = (workspaces ?? []).filter((w) => !w.archived);
  const strongCount = profileReady ? (top.data ?? []).filter((o) => (o.match?.score ?? 0) >= STRONG).length : 0;
  const unread = notifications.data?.unread_count ?? 0;

  // Hero: best match if there is one, else the nearest saved deadline, else none.
  const bestMatch = profileReady ? top.data?.[0] : undefined;
  const heroLoading = profileReady && top.isLoading;
  const heroOpp = bestMatch ?? (!heroLoading ? upcoming[0] : undefined);
  const hero = bestMatch ? (
    <TopMatchHero opp={bestMatch} />
  ) : heroLoading ? (
    <BentoCell span={4} variant="hero" label="Loading your top match">
      <div className="h-full min-h-24 animate-pulse rounded-lg bg-hero-foreground/10" aria-hidden />
    </BentoCell>
  ) : upcoming[0] ? (
    <DeadlineHero opp={upcoming[0]} />
  ) : null;

  // De-duplication: hero -> Top matches -> Near you.
  const otherMatches = (bestMatch && (top.data?.length ?? 0) > 1 ? top.data!.slice(1) : top.data ?? []).slice(0, 4);
  const shown = new Set([heroOpp?.id, ...otherMatches.map((o) => o.id)].filter(Boolean) as string[]);
  const regional = [...(nearYou.data ?? []), ...(gcc.data ?? [])]
    .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)
    .filter((o) => !shown.has(o.id))
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .slice(0, 3);
  const regionalLoading = nearYou.isLoading || gcc.isLoading;

  // "2 deadlines this week · 3 strong matches · 1 unread notification", zero parts skipped.
  const summaryParts = [
    dueSoon.length ? plural(dueSoon.length, "deadline") + " this week" : null,
    strongCount ? `${strongCount} strong ${strongCount === 1 ? "match" : "matches"}` : null,
    unread ? plural(unread, "unread notification") : null,
  ].filter(Boolean);
  const summary = summaryParts.length ? summaryParts.join(" · ") : "You're all caught up.";

  const nextDays = upcoming[0] ? daysUntil(upcoming[0].deadline) : null;
  const bestScore = top.data?.[0]?.match?.score;
  const sharedFiles = activeFiles.filter((w) => w.member_count > 1).length;

  return (
    <BentoGrid>
      {/* Row 1 */}
      <GreetingCell name={firstName(user.name)} span={hero ? 8 : 12} summary={summary} profile={profile} />
      {hero}

      {/* Row 2: stats */}
      <StatCell
        icon={Bookmark}
        label="Saved"
        value={saved.data?.length ?? 0}
        loading={saved.isLoading}
        href="/discover"
        sub={nextDays !== null ? `next closes in ${nextDays === 0 ? "less than a day" : plural(nextDays, "day")}` : "save opportunities from Discover"}
      />
      <StatCell
        icon={CalendarClock}
        label="Due this week"
        value={dueSoon.length}
        loading={saved.isLoading}
        href="/discover"
        className={cn(dueSoon.length > 0 && "border-rose-500/30")}
        sub={dueSoon.length ? (nextDays === 0 ? "the next one closes today" : `the next one closes in ${plural(nextDays ?? 0, "day")}`) : "nothing closing in 7 days"}
      />
      <StatCell
        icon={Target}
        label="Strong matches"
        value={strongCount}
        loading={profileReady && top.isLoading}
        href="/discover"
        sub={!profileReady ? "finish your profile to see matches" : bestScore ? `scoring ${STRONG}+ · best ${bestScore}` : `scoring ${STRONG}+`}
      />
      <StatCell
        icon={FolderOpen}
        label="Application Files"
        value={activeFiles.length}
        loading={filesLoading}
        href="/files"
        sub={activeFiles.length ? `${sharedFiles} shared with teammates` : "start one for your next application"}
      />

      {/* Row 3 */}
      <BentoCell span={6} label="Top matches for you">
        <BentoHeader icon={Target} title="Top matches for you" action={<BentoAction href="/discover">See all</BentoAction>} />
        {!profileReady ? (
          <EmptyState
            icon={Target}
            text="Matches are ranked against your profile. Upload your CV to get started."
            action={
              <Button asChild size="sm">
                <Link href={profileEditHref(profile)}>Upload your CV</Link>
              </Button>
            }
          />
        ) : top.isLoading ? (
          <RowSkeleton rows={4} />
        ) : !otherMatches.length ? (
          <EmptyState
            icon={Target}
            text="No other matches yet. New listings arrive after each re-check."
            action={
              <Button asChild size="sm">
                <Link href="/discover">Explore opportunities</Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-1">
            {otherMatches.map((o, i) => (
              <OpportunityRow
                key={o.id}
                opp={o}
                index={i}
                sub={<ReasonChips reasons={o.match?.reasons ?? []} />}
                aside={
                  <>
                    {o.eligibility_check && o.eligibility_check.verdict !== "eligible" && <EligibilityPill verdict={o.eligibility_check.verdict} />}
                    <DeadlineBadge deadline={o.deadline} />
                  </>
                }
              />
            ))}
          </div>
        )}
      </BentoCell>

      <BentoCell span={6} label="Deadline timeline" className={cn(dueSoon.length > 0 && "border-rose-500/30")}>
        <BentoHeader icon={CalendarClock} title="Next 30 days" action={<BentoAction href="/discover">Find more</BentoAction>} />
        {saved.isLoading ? (
          <div className="flex flex-col gap-4" aria-hidden>
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <RowSkeleton rows={3} score={false} />
          </div>
        ) : (
          <DeadlineTimeline saved={saved.data ?? []} />
        )}
      </BentoCell>

      {/* Row 4 */}
      <ContinueCell />
      <FilesCell files={activeFiles} loading={filesLoading} />

      {/* Row 5 */}
      <BentoCell span={6} label="Near you: UAE and GCC">
        <BentoHeader icon={MapPin} title="Near you: UAE & GCC" action={<BentoAction href={REGION_SEARCH}>See all</BentoAction>} />
        {regionalLoading ? (
          <RowSkeleton rows={3} />
        ) : regional.length ? (
          <div className="flex flex-col gap-1">
            {regional.map((o, i) => (
              <OpportunityRow key={o.id} opp={o} index={i} sub={<span className="line-clamp-1 text-xs text-muted-foreground">{o.organization}</span>} aside={<DeadlineBadge deadline={o.deadline} />} />
            ))}
            {regional.length < 2 && (
              <Link href={REGION_SEARCH} className="mt-1 text-sm font-medium underline-offset-2 hover:underline">
                See all in the UAE &amp; GCC →
              </Link>
            )}
          </div>
        ) : (
          <EmptyState
            icon={MapPin}
            text="Nothing else in the UAE or GCC beyond your matches above right now."
            action={
              <Button asChild size="sm">
                <Link href={REGION_SEARCH}>See all in the UAE &amp; GCC</Link>
              </Button>
            }
          />
        )}
      </BentoCell>

      <BentoCell span={6} label="Recommended by faculty">
        <BentoHeader icon={Sparkles} title="Recommended by faculty" />
        {endorsed.isLoading ? (
          <RowSkeleton rows={3} />
        ) : endorsed.data?.length ? (
          <div className="flex flex-1 flex-col gap-2">
            {endorsed.data.slice(0, 3).map((o, i) => (
              <div key={o.id}>
                <OpportunityRow opp={o} index={i} sub={<span className="line-clamp-1 text-xs text-muted-foreground">{o.organization}</span>} />
                {o.endorsements[0] && (
                  <p className="ml-[3.25rem] line-clamp-2 text-xs text-honor">
                    <span className="font-medium">{o.endorsements[0].faculty_name}</span>
                    {o.endorsements[0].note ? <>: &ldquo;{o.endorsements[0].note}&rdquo;</> : " recommends this"}
                  </p>
                )}
              </div>
            ))}
            {endorsed.data.length < 3 && (
              // A short explainer keeps a cell with one or two recommendations from looking empty.
              <p className="mt-auto border-t pt-3 text-xs text-muted-foreground">
                Faculty endorse listings for students with your degree and year. A new one arrives as a notification.{" "}
                <Link href="/settings/notifications" className="underline-offset-2 hover:text-foreground hover:underline">
                  Notification settings
                </Link>
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            text="When faculty recommend something for students like you, it shows up here."
            action={
              <Button asChild size="sm">
                <Link href="/discover">Explore opportunities</Link>
              </Button>
            }
          />
        )}
      </BentoCell>

      {/* Row 6 */}
      <NotificationsCell />
    </BentoGrid>
  );
}
