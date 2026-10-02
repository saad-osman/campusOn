"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, Check, GraduationCap, Layers, MapPin, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FUNDING_LABELS, REGION_LABELS, TYPE_LABELS, timeAgo } from "@/lib/format";
import { useToggleSave } from "@/lib/opportunities";
import type { Opportunity } from "@/lib/types";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { EligibilityBadge } from "@/components/opportunity/eligibility-badge";
import { MatchScore } from "@/components/opportunity/match-score";

export function SaveButton({ opp, className }: { opp: Opportunity; className?: string }) {
  const toggle = useToggleSave();
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await toggle.mutateAsync({ id: opp.id, saved: opp.saved });
          toast.success(opp.saved ? "Removed from saved" : "Saved. You'll get alerts if it changes");
        } catch {
          toast.error("Couldn't update. Try again.");
        }
      }}
      disabled={toggle.isPending}
      aria-pressed={opp.saved}
      aria-label={opp.saved ? `Unsave ${opp.title}` : `Save ${opp.title}`}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        opp.saved && "text-primary",
        className
      )}
    >
      {opp.saved ? <BookmarkCheck className="size-5" /> : <Bookmark className="size-5" />}
    </button>
  );
}

export function OpportunityMeta({ opp }: { opp: Opportunity }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <DeadlineBadge deadline={opp.deadline} deadlineText={opp.deadline_text} />
      <span className="inline-flex items-center gap-1">
        <Wallet className="size-4" aria-hidden />
        {opp.funding_amount ? `${FUNDING_LABELS[opp.funding_type]} · ${opp.funding_amount}` : FUNDING_LABELS[opp.funding_type]}
      </span>
      {(opp.location || opp.regions.length > 0) && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-4" aria-hidden />
          {opp.location || opp.regions.map((r) => REGION_LABELS[r]).join(", ")}
          {opp.is_remote && " · remote"}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <GraduationCap className="size-4" aria-hidden />
        {opp.degree_levels.includes("any")
          ? "Any level"
          : opp.degree_levels.map((d) => ({ bachelors: "UG", masters: "Master's", phd: "PhD", postdoc: "Postdoc" })[d] || d).join(" · ")}
      </span>
    </div>
  );
}

export function TrustLine({ opp }: { opp: Opportunity }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {opp.verified && (
        <span className="inline-flex items-center gap-1 font-medium text-honor">
          <ShieldCheck className="size-4" aria-hidden /> Verified by BPDC faculty
        </span>
      )}
      {opp.source_count > 1 && (
        <span className="inline-flex items-center gap-1">
          <Layers className="size-4" aria-hidden /> Found on {opp.source_count} sources
        </span>
      )}
      <span>Last checked {timeAgo(opp.last_checked)}</span>
    </div>
  );
}

export function OpportunityCard({ opp, compact = false }: { opp: Opportunity; compact?: boolean }) {
  const endorsement = opp.endorsements[0];
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:border-primary/40",
        opp.status === "expired" && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        {opp.match && <MatchScore score={opp.match.score} size={compact ? 42 : 50} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {TYPE_LABELS[opp.type]} · {opp.organization}
            {opp.status === "expired" && " · expired"}
          </p>
          <h3 className="mt-0.5 font-semibold leading-snug">
            <Link
              href={`/opportunities/${opp.id}`}
              className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {opp.title}
            </Link>
          </h3>
        </div>
        <SaveButton opp={opp} className="relative z-10 -mr-1 -mt-1" />
      </div>

      {opp.match && opp.match.reasons.length > 0 && !compact && (
        <ul className="flex flex-col gap-1 text-sm">
          {opp.match.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5">
              <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      {endorsement && (
        <p className="relative z-10 flex items-start gap-1.5 rounded-md border border-gold/40 bg-accent px-2.5 py-1.5 text-xs text-accent-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-honor" aria-hidden />
          <span>
            <strong>Recommended by {endorsement.faculty_name}</strong>
            {endorsement.note ? `: “${endorsement.note}”` : ""}
          </span>
        </p>
      )}

      <OpportunityMeta opp={opp} />

      {(opp.eligibility_check || !compact) && (
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-2">
          {opp.eligibility_check ? <EligibilityBadge check={opp.eligibility_check} /> : <span />}
          {!compact && <TrustLine opp={opp} />}
        </div>
      )}
    </article>
  );
}

export function OpportunityCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" aria-hidden>
      <div className="flex gap-3">
        <div className="size-12 animate-pulse rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}
