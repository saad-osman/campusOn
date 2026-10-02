"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, History, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EligibilityExplanation, EligibilityPill } from "@/components/opportunity/eligibility-badge";
import { MatchScore } from "@/components/opportunity/match-score";
import { OpportunityMeta, SaveButton, TrustLine } from "@/components/opportunity/opportunity-card";
import { OpportunityActions } from "@/components/opportunity/actions";
import { ProfessorsSection } from "@/components/opportunity/professors-section";
import { useRequireUser } from "@/lib/auth";
import { DEGREE_LABELS, TYPE_LABELS, formatDate, parseServerTime } from "@/lib/format";
import { useOpportunity, useOpportunityChanges } from "@/lib/opportunities";
import { useTrackRoute } from "@/lib/state";
import type { EligibilityRequirements, Opportunity } from "@/lib/types";

const COMPONENT_LABELS: Record<string, [string, number]> = {
  semantic: ["Topic similarity", 45],
  eligibility: ["Eligibility", 25],
  fields: ["Field overlap", 15],
  deadline: ["Time to prepare", 10],
  funding: ["Funding", 5],
};

function MatchBreakdown({ opp }: { opp: Opportunity }) {
  if (!opp.match) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Why this score</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1.5 text-sm">
          {opp.match.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2">
          {Object.entries(COMPONENT_LABELS).map(([key, [label, weight]]) => {
            const value = opp.match!.components[key] ?? 0;
            return (
              <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">
                  {label} <span className="opacity-70">({weight}%)</span>
                </dt>
                <dd className="tabular-nums">{Math.round(value * weight)} / {weight}</dd>
                <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${value * 100}%` }} />
                </div>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

function Requirements({ e, degreeLevels }: { e: EligibilityRequirements; degreeLevels: string[] }) {
  const rows: [string, string][] = [];
  const levels = e.degree_levels?.length ? e.degree_levels : degreeLevels;
  if (levels?.length) rows.push(["Degree level", levels.map((l) => DEGREE_LABELS[l] || l).join(", ")]);
  if (e.min_year || e.max_year)
    rows.push(["Year of study", [e.min_year && `from year ${e.min_year}`, e.max_year && `up to year ${e.max_year}`].filter(Boolean).join(", ")]);
  if (e.min_cgpa) rows.push(["Minimum CGPA", `${e.min_cgpa.value} / ${e.min_cgpa.scale}`]);
  const english = Object.entries(e.english_requirements || {}).filter(([, v]) => v);
  if (english.length) rows.push(["English", english.map(([k, v]) => `${k} ${v}`).join(" or ")]);
  if (e.nationality_allowed?.length && !e.nationality_allowed.includes("any"))
    rows.push(["Nationality", e.nationality_allowed.join(", ")]);
  if (e.nationality_excluded?.length) rows.push(["Not open to", e.nationality_excluded.join(", ")]);
  if (e.residency_required) rows.push(["Residency", e.residency_required]);
  if (e.required_fields?.length) rows.push(["Fields", e.required_fields.join(", ")]);
  if (e.other_requirements?.length) rows.push(["Also needed", e.other_requirements.join("; ")]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No specific requirements were listed.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ChangeHistory({ id }: { id: string }) {
  const { data: changes } = useOpportunityChanges(id);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden /> Change history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!changes ? (
          <div className="h-10 animate-pulse rounded bg-muted" />
        ) : changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes since we first found this listing.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l pl-4">
            {changes.map((c, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
                <p className="text-sm font-medium">{c.summary || `${c.field} changed`}</p>
                <p className="text-xs text-muted-foreground">
                  {parseServerTime(c.detected_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  useRequireUser(`/opportunities/${id}`);
  useTrackRoute(`/opportunities/${id}`);
  const { data: opp, isLoading, error } = useOpportunity(id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (error || !opp) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-medium">This opportunity isn&apos;t available.</p>
        <p className="text-sm text-muted-foreground">It may have been removed, or it&apos;s still waiting for faculty review.</p>
        <Button asChild variant="outline">
          <Link href="/discover">Back to Discover</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/discover" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Discover
      </Link>

      <header className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-start">
        {opp.match && <MatchScore score={opp.match.score} size={72} />}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{TYPE_LABELS[opp.type]}</Badge>
            <span>{opp.organization}</span>
            {opp.status !== "active" && <Badge variant="outline">{opp.status.replace("_", " ")}</Badge>}
          </div>
          <h1 className="font-heading text-2xl font-semibold leading-tight tracking-tight">{opp.title}</h1>
          <OpportunityMeta opp={opp} />
          <TrustLine opp={opp} />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <SaveButton opp={opp} />
          {opp.url && (
            <Button asChild variant="outline" size="sm">
              <a href={opp.url} target="_blank" rel="noopener noreferrer">
                Official page <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      </header>

      <OpportunityActions opp={opp} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {opp.endorsements.map((e) => (
            <div key={e.id} className="flex gap-3 rounded-xl border border-gold/40 bg-accent p-4 text-sm text-accent-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-foreground dark:text-gold" aria-hidden />
              <div>
                <p className="font-medium">Recommended by {e.faculty_name}</p>
                {e.note && <p className="mt-0.5 text-muted-foreground">“{e.note}”</p>}
              </div>
            </div>
          ))}

          {opp.description_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm leading-relaxed">{opp.description_summary}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Deadline: {opp.deadline ? formatDate(opp.deadline) : opp.deadline_text || "not stated"}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                Eligibility
                {opp.eligibility_check && <EligibilityPill verdict={opp.eligibility_check.verdict} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {opp.eligibility_check ? (
                <EligibilityExplanation check={opp.eligibility_check} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link href="/onboarding" className="underline">Complete your profile</Link> to see whether you qualify.
                </p>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">As listed</p>
                <Requirements e={opp.eligibility || {}} degreeLevels={opp.degree_levels} />
              </div>
            </CardContent>
          </Card>

          <ProfessorsSection opp={opp} />
        </div>

        <div className="flex flex-col gap-6">
          <MatchBreakdown opp={opp} />
          <ChangeHistory id={opp.id} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4" aria-hidden /> Sources ({opp.source_count})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {opp.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {s.name}
                    </a>
                    <span className="ml-1 text-xs uppercase text-muted-foreground">{s.region}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Extraction confidence {Math.round(opp.overall_confidence * 100)}%. Always confirm details on the official page.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
