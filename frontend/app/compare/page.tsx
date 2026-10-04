"use client";

import * as React from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { Check, Clock, Columns3, Database, FlaskConical, Plus, ShieldCheck, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { IconTile } from "@/components/icon-tile";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { EligibilityBadge } from "@/components/opportunity/eligibility-badge";
import { MatchScore } from "@/components/opportunity/match-score";
import { SaveButton } from "@/components/opportunity/opportunity-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/api";
import { useCompareProfessors } from "@/lib/actions";
import { useRequireUser } from "@/lib/auth";
import { MAX_COMPARE, useCompare } from "@/lib/compare";
import { DEGREE_LABELS, FUNDING_LABELS, REGION_LABELS, TYPE_LABELS, daysUntil, formatDate } from "@/lib/format";
import { EASE_OUT, useCountUp, usePrefersReducedMotion } from "@/lib/motion";
import { opportunityQuery } from "@/lib/opportunities";
import { useTrackRoute } from "@/lib/state";
import { cn } from "@/lib/utils";
import type { CompareProfessors, Opportunity, Verdict } from "@/lib/types";

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";
const HONOR_PILL =
  "inline-flex w-fit items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-honor ring-1 ring-inset ring-honor/25";
const CARD = "rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)]";

// ---------- motion (same timing as Discover's cards) ----------

const STEP_MS = 60;
/** Columns animate only for this long after they first appear, so a later re-render, the
 *  differences toggle revealing rows, or removing another column never replays them. */
const ENTER_WINDOW_MS = 1500;
const ENTER_CLASS = "animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both";

const stagger = (index: number) => Math.min(index, 8) * STEP_MS;

/** Per-element entrance: its place in the stagger and whether it animates at all. */
type Motion = { index: number; animate: boolean };

/** Fade and rise in (500ms) after `index` steps of the stagger; static when not animating. */
function enterProps(m: Motion): { className: string; style?: React.CSSProperties } {
  if (!m.animate) return { className: "" };
  return {
    className: ENTER_CLASS,
    style: { animationDelay: `${stagger(m.index)}ms`, "--tw-ease": EASE_OUT } as React.CSSProperties,
  };
}

/** A whole number that counts up (useCountUp handles reduced motion and the server render). */
function CountUp({ value, delay = 0, enabled = true }: { value: number; delay?: number; enabled?: boolean }) {
  return <>{Math.round(useCountUp(value, { delay, enabled }))}</>;
}

const ELIGIBILITY_RANK: Record<Verdict, number> = { eligible: 3, partially_eligible: 2, unknown: 1, not_eligible: 0 };
const FUNDING_RANK: Record<Opportunity["funding_type"], number> = {
  fully_funded: 4, stipend: 3, partial: 2, unfunded: 1, unknown: 0,
};

// ---------- rows ----------

type Row = {
  key: string;
  label: string;
  render: (o: Opportunity, m: Motion) => React.ReactNode;
  /** Compared across columns for "Show differences only". Omitted: the row is never hidden. */
  value?: (o: Opportunity) => string;
  /** Higher wins "Best here"; null never wins. */
  best?: (o: Opportunity) => number | null;
};

type Section = { label: string; rows: Row[] };

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;

function degreeText(o: Opportunity) {
  if (!o.degree_levels.length) return "Not stated";
  return o.degree_levels.map((d) => DEGREE_LABELS[d] ?? d).join(", ");
}

function cgpaText(o: Opportunity) {
  const c = o.eligibility?.min_cgpa;
  return c ? `${c.value.toFixed(2)} / ${c.scale.toFixed(1)}` : "Not stated";
}

function englishText(o: Opportunity) {
  const reqs = Object.entries(o.eligibility?.english_requirements ?? {});
  return reqs.length ? reqs.map(([test, score]) => (score != null ? `${test} ${score}` : test)).join(" · ") : "Not stated";
}

function uaeText(o: Opportunity) {
  return o.open_to_uae_residents === true ? "Yes" : o.open_to_uae_residents === false ? "No" : "Not stated";
}

function locationValue(o: Opportunity) {
  return [o.location ?? "", o.regions.join(","), o.is_remote ? "remote" : ""].join("|");
}

const SECTIONS: Section[] = [
  {
    label: "Fit",
    rows: [
      {
        key: "match",
        label: "Match score",
        render: (o, m) =>
          o.match ? (
            <MatchScore score={o.match.score} size={44} animate={m.animate} delay={stagger(m.index) + 150} />
          ) : (
            muted("Add your profile to see it")
          ),
        value: (o) => String(o.match?.score ?? ""),
        best: (o) => o.match?.score ?? null,
      },
      {
        key: "eligibility",
        label: "Eligibility",
        render: (o) =>
          o.eligibility_check ? (
            <div className="flex flex-col gap-1.5">
              <EligibilityBadge check={o.eligibility_check} />
              {o.eligibility_check.missing.length > 0 && (
                <p className="text-xs text-muted-foreground">Missing: {o.eligibility_check.missing.join("; ")}</p>
              )}
            </div>
          ) : (
            muted("Add your profile to check")
          ),
        value: (o) => `${o.eligibility_check?.verdict ?? ""}|${o.eligibility_check?.missing.join(";") ?? ""}`,
        best: (o) => (o.eligibility_check ? ELIGIBILITY_RANK[o.eligibility_check.verdict] : null),
      },
      {
        key: "reasons",
        label: "Why it matches",
        render: (o) =>
          o.match?.reasons.length ? (
            <ul className="flex flex-col gap-1 text-xs">
              {o.match.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5">
                  <Check className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            muted("Not available")
          ),
        value: (o) => (o.match?.reasons ?? []).join("|"),
      },
    ],
  },
  {
    label: "Timing and money",
    rows: [
      {
        key: "deadline",
        label: "Deadline",
        render: (o) => (
          <div className="flex flex-col gap-0.5">
            <span className="tabular-nums">{o.deadline ? formatDate(o.deadline) : o.deadline_text || "Rolling"}</span>
            <DeadlineBadge deadline={o.deadline} deadlineText={o.deadline_text} />
          </div>
        ),
        value: (o) => o.deadline ?? o.deadline_text ?? "",
        best: (o) => daysUntil(o.deadline),
      },
      {
        key: "funding",
        label: "Funding",
        render: (o) => (
          <div className="flex flex-col gap-0.5">
            <span>{FUNDING_LABELS[o.funding_type]}</span>
            {o.funding_amount && <span className="text-xs text-muted-foreground">{o.funding_amount}</span>}
          </div>
        ),
        value: (o) => `${o.funding_type}|${o.funding_amount ?? ""}`,
        best: (o) => FUNDING_RANK[o.funding_type],
      },
    ],
  },
  {
    label: "Details",
    rows: [
      { key: "type", label: "Type", render: (o) => TYPE_LABELS[o.type], value: (o) => o.type },
      { key: "degree", label: "Degree level", render: degreeText, value: degreeText },
      {
        key: "fields",
        label: "Fields",
        render: (o) =>
          o.fields.length ? (
            <div className="flex flex-wrap gap-1">
              {o.fields.map((f) => (
                <span key={f} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {f}
                </span>
              ))}
            </div>
          ) : (
            muted("Not stated")
          ),
        value: (o) => [...o.fields].sort().join("|"),
      },
      {
        key: "location",
        label: "Location",
        render: (o) => (
          <div className="flex flex-col gap-0.5">
            <span>
              {o.location || (o.regions.length ? "" : "Not stated")}
              {o.is_remote && (o.location ? " · remote" : "Remote")}
            </span>
            {o.regions.length > 0 && (
              <span className="text-xs text-muted-foreground">{o.regions.map((r) => REGION_LABELS[r]).join(", ")}</span>
            )}
          </div>
        ),
        value: locationValue,
      },
      { key: "uae", label: "Open to UAE residents", render: (o) => uaeText(o), value: uaeText },
    ],
  },
  {
    label: "Requirements",
    rows: [
      { key: "cgpa", label: "Minimum CGPA", render: (o) => <span className="tabular-nums">{cgpaText(o)}</span>, value: cgpaText },
      { key: "english", label: "English test", render: (o) => <span className="tabular-nums">{englishText(o)}</span>, value: englishText },
    ],
  },
];

function trustSection(professors: { byId: Map<string, CompareProfessors>; loading: boolean }): Section {
  return {
    label: "Trust and people",
    rows: [
      {
        key: "endorsements",
        label: "Faculty endorsements",
        render: (o, m) =>
          o.endorsements.length ? (
            <div className="flex flex-col gap-1">
              <span className={cn(HONOR_PILL, "tabular-nums")}>
                <CountUp value={o.endorsements.length} delay={stagger(m.index) + 150} enabled={m.animate} />
              </span>
              <span className="text-xs text-muted-foreground">
                {Array.from(new Set(o.endorsements.map((e) => e.faculty_name))).join(", ")}
              </span>
            </div>
          ) : (
            muted("None")
          ),
        value: (o) => String(o.endorsements.length),
        best: (o) => o.endorsements.length,
      },
      {
        key: "verified",
        label: "Verified",
        render: (o) =>
          o.verified ? (
            <span className={HONOR_PILL}>
              <ShieldCheck className="size-3.5" aria-hidden /> Verified by BPDC faculty
            </span>
          ) : (
            muted("Not yet")
          ),
        value: (o) => String(o.verified),
      },
      {
        key: "sources",
        label: "Found on",
        render: (o, m) => (
          <span className="tabular-nums">
            <CountUp value={o.source_count} delay={stagger(m.index) + 150} enabled={m.animate} /> source
            {o.source_count === 1 ? "" : "s"}
          </span>
        ),
        value: (o) => String(o.source_count),
        best: (o) => o.source_count,
      },
      {
        key: "researchers",
        label: "Researchers to contact",
        render: (o) => <ResearchersCell opp={o} result={professors.byId.get(o.id)} loading={professors.loading} />,
      },
    ],
  };
}

// ---------- researchers cell ----------

const SOURCE_NOTES: Record<CompareProfessors["source"], { icon: React.ElementType; text: string }> = {
  cache: { icon: Database, text: "From saved Semantic Scholar results" },
  ai: { icon: Sparkles, text: "Suggested by AI. Check before contacting" },
  sample: { icon: FlaskConical, text: "Sample researchers (fictional)" },
};

function ResearchersCell({ opp, result, loading }: { opp: Opportunity; result?: CompareProfessors; loading: boolean }) {
  if (loading && !result) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }
  const note = result ? SOURCE_NOTES[result.source] : null;
  return (
    <div className="flex flex-col gap-2">
      {!result?.authors.length ? (
        muted("None found")
      ) : (
        <ul className="flex flex-col gap-1.5">
          {result.authors.map((a) => (
            <li key={a.name} className="flex flex-col leading-snug">
              {a.profile_url ? (
                <a href={a.profile_url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
                  {a.name}
                </a>
              ) : (
                <span className="font-medium">{a.name}</span>
              )}
              {a.affiliation && <span className="text-xs text-muted-foreground">{a.affiliation}</span>}
            </li>
          ))}
        </ul>
      )}
      {note && result && result.authors.length > 0 && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <note.icon className="size-3 shrink-0" aria-hidden />
          {note.text}
        </p>
      )}
      <Link href={`/opportunities/${opp.id}#researchers`} className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        All researchers
      </Link>
    </div>
  );
}

// ---------- summary ----------

function SummaryCard({ icon: Icon, label, value, index, children }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  index: number;
  children?: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const enter = enterProps({ index, animate: !reduced });
  return (
    <div className={cn(CARD, "flex flex-col gap-1.5 p-4", enter.className)} style={enter.style}>
      <p className={cn(SECTION_LABEL, "flex items-center gap-1.5")}>
        <Icon className="size-4" aria-hidden /> {label}
      </p>
      <p className="line-clamp-2 font-semibold leading-snug">{value}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

function Summary({ opps }: { opps: Opportunity[] }) {
  const scored = opps.filter((o) => o.match);
  const best = scored.length ? scored.reduce((a, b) => (b.match!.score > a.match!.score ? b : a)) : null;
  const dated = opps.filter((o) => o.deadline && (daysUntil(o.deadline) ?? -1) >= 0);
  const first = dated.length ? dated.reduce((a, b) => ((b.deadline as string) < (a.deadline as string) ? b : a)) : null;
  const eligible = opps.filter((o) => o.eligibility_check?.verdict === "eligible");
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <SummaryCard icon={Sparkles} label="Best match" index={0} value={best ? best.title : "No match scores yet"}>
        {best ? (
          <>
            <span className="tabular-nums">
              Score <CountUp value={best.match!.score} delay={stagger(0) + 150} />.
            </span> {best.match!.reasons[0] ?? ""}
          </>
        ) : (
          "Complete your profile to see match scores."
        )}
      </SummaryCard>
      <SummaryCard icon={Clock} label="Closes first" index={1} value={first ? first.title : "No fixed deadlines"}>
        {first ? <DeadlineBadge deadline={first.deadline} deadlineText={first.deadline_text} /> : "All rolling or unstated."}
      </SummaryCard>
      <SummaryCard
        icon={Check}
        label="Eligible now"
        index={2}
        value={
          <span className="tabular-nums">
            <CountUp value={eligible.length} delay={stagger(2) + 150} /> of {opps.length}
          </span>
        }
      >
        <span className="line-clamp-2">{eligible.length ? eligible.map((o) => o.title).join(", ") : "None yet."}</span>
      </SummaryCard>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(CARD, "flex flex-col gap-2 p-4")}>
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className={cn(CARD, "overflow-hidden")} aria-hidden>
      <div className="flex border-b">
        <div className="w-[168px] shrink-0 border-r p-3" />
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col gap-2 p-3">
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((r) => (
        <div key={r} className="flex border-b last:border-0">
          <div className="w-[168px] shrink-0 border-r p-3">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="flex-1 p-3">
              <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------- table ----------

/** Winning column ids for a row: only with 2+ items, and only when the scores differ. */
function winners(row: Row, opps: Opportunity[]): Set<string> {
  if (!row.best || opps.length < 2) return new Set();
  const scores = opps.map((o) => row.best!(o));
  if (new Set(scores).size <= 1) return new Set();
  const valid = scores.filter((s): s is number => s !== null);
  if (!valid.length) return new Set();
  const top = Math.max(...valid);
  return new Set(opps.filter((_, i) => scores[i] === top).map((o) => o.id));
}

function isIdentical(row: Row, opps: Opportunity[]) {
  if (!row.value || opps.length < 2) return false;
  return new Set(opps.map((o) => row.value!(o))).size === 1;
}

function CompareTable({ opps, sections, diffOnly, onRemove }: {
  opps: Opportunity[];
  sections: Section[];
  diffOnly: boolean;
  onRemove: (o: Opportunity) => void;
}) {
  const slotsLeft = MAX_COMPARE - opps.length;
  const totalCols = 1 + opps.length + (slotsLeft > 0 ? 1 : 0);
  const reduced = usePrefersReducedMotion();
  // When each column first appeared. The first columns follow the summary cards (3 steps in).
  const firstSeen = React.useRef(new Map<string, number>());
  const now = Date.now();
  const columns = opps.map((o, i) => {
    if (!firstSeen.current.has(o.id)) firstSeen.current.set(o.id, now);
    const motion: Motion = { index: 3 + i, animate: !reduced && now - firstSeen.current.get(o.id)! < ENTER_WINDOW_MS };
    return { opp: o, motion, enter: enterProps(motion) };
  });
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[168px]" />
            {columns.map(({ opp: o }) => <col key={o.id} />)}
            {slotsLeft > 0 && <col />}
          </colgroup>
          <thead>
            <tr className="border-b">
              <td className="sticky left-0 z-10 border-r bg-card" />
              {columns.map(({ opp: o, enter }) => (
                <th
                  key={o.id}
                  scope="col"
                  className={cn("relative p-3 pr-10 text-left align-top font-normal", enter.className)}
                  style={enter.style}
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1.5 top-1.5 text-muted-foreground"
                    aria-label={`Remove ${o.title} from compare`}
                    onClick={() => onRemove(o)}
                  >
                    <X />
                  </Button>
                  <Link href={`/opportunities/${o.id}`} className="line-clamp-2 font-semibold leading-snug underline-offset-2 hover:underline">
                    {o.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.organization}</p>
                  <SaveButton opp={o} className="-ml-1.5 mt-1" />
                </th>
              ))}
              {slotsLeft > 0 && (
                <td className="p-3 align-top">
                  <Link
                    href="/discover"
                    className="flex h-full min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <Plus className="size-4" aria-hidden />
                    <span className="font-medium">Add from Discover</span>
                    <span className="tabular-nums">
                      {slotsLeft} slot{slotsLeft === 1 ? "" : "s"} left
                    </span>
                  </Link>
                </td>
              )}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = section.rows.filter((r) => !(diffOnly && isIdentical(r, opps)));
              if (!rows.length) return null;
              return (
                <React.Fragment key={section.label}>
                  <tr className="border-b bg-muted">
                    <th scope="colgroup" colSpan={totalCols} className="px-3 py-1.5 text-left">
                      <span className={cn(SECTION_LABEL, "sticky left-3")}>{section.label}</span>
                    </th>
                  </tr>
                  {rows.map((row) => {
                    const win = winners(row, opps);
                    return (
                      <tr key={row.key} className="border-b last:border-0">
                        <th scope="row" className="sticky left-0 z-10 w-[168px] border-r bg-card p-3 text-left align-top text-xs font-medium text-muted-foreground">
                          {row.label}
                        </th>
                        {columns.map(({ opp: o, motion, enter }) => (
                          <td
                            key={o.id}
                            className={cn("p-3 align-top tabular-nums", win.has(o.id) && "bg-accent/70", enter.className)}
                            style={enter.style}
                          >
                            {win.has(o.id) && (
                              <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-honor">
                                <Star className="size-3 fill-gold text-gold" aria-hidden /> Best here
                              </span>
                            )}
                            {row.render(o, motion)}
                          </td>
                        ))}
                        {slotsLeft > 0 && <td />}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- page ----------

export default function ComparePage() {
  useRequireUser("/compare");
  useTrackRoute("/compare");
  const compare = useCompare();
  const { ids, ready } = compare;
  const [diffOnly, setDiffOnly] = React.useState(false);

  const results = useQueries({ queries: ids.map((id) => opportunityQuery(id)) });
  const professors = useCompareProfessors(ids);

  // Drop ones that are gone (404) or no longer open (expired, broken), with one toast.
  const handled = React.useRef(new Set<string>());
  React.useEffect(() => {
    const gone = ids.filter((id, i) => {
      if (handled.current.has(id)) return false;
      const r = results[i];
      if (!r) return false;
      if (r.error instanceof ApiError && r.error.status === 404) return true;
      return !!r.data && r.data.status !== "active";
    });
    if (!gone.length) return;
    gone.forEach((id) => handled.current.add(id));
    compare.removeMany(gone);
    toast(`Removed ${gone.length} ${gone.length === 1 ? "opportunity that is" : "opportunities that are"} no longer available`);
  }, [ids, results, compare]);

  const opps = ids
    .map((_, i) => results[i]?.data)
    .filter((o): o is Opportunity => !!o && o.status === "active");
  const loading = !ready || results.some((r) => r.isPending && r.fetchStatus !== "idle");

  const sections = React.useMemo(() => {
    const byId = new Map((professors.data ?? []).map((p) => [p.opportunity_id, p]));
    return [...SECTIONS, trustSection({ byId, loading: professors.isLoading })];
  }, [professors.data, professors.isLoading]);

  const hiddenCount =
    diffOnly && opps.length >= 2 ? sections.flatMap((s) => s.rows).filter((r) => isIdentical(r, opps)).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Compare opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Side by side, one column each. Up to {MAX_COMPARE} at once; add more from an opportunity&apos;s page in Discover.
        </p>
      </header>

      {loading ? (
        <>
          <SummarySkeleton />
          <TableSkeleton columns={Math.max(ids.length, 2)} />
        </>
      ) : opps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <IconTile icon={Columns3} />
            <p className="text-sm">Nothing to compare yet. Open any opportunity in Discover and choose Add to compare.</p>
            <Button asChild>
              <Link href="/discover">Browse Discover</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Summary opps={opps} />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Switch id="diff-only" checked={diffOnly && opps.length >= 2} onCheckedChange={setDiffOnly} disabled={opps.length < 2} />
                <Label htmlFor="diff-only">Show differences only</Label>
                {hiddenCount > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {hiddenCount} identical row{hiddenCount === 1 ? "" : "s"} hidden
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {opps.length} of {MAX_COMPARE} slots
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">Clear all</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear the comparison?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes all {opps.length} opportunities from compare. Saved opportunities stay saved.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => compare.clear()}>Clear all</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {opps.length === 1 && (
              <p className="text-sm text-muted-foreground">
                Add at least one more opportunity to see differences and the best value in each row.
              </p>
            )}
          </div>

          <CompareTable opps={opps} sections={sections} diffOnly={diffOnly && opps.length >= 2} onRemove={(o) => compare.remove(o.id)} />
        </>
      )}
    </div>
  );
}
