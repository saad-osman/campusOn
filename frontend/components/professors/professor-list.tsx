"use client";

import { ExternalLink, Mail, MapPin, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { Professor, ProfessorRef, ProfessorSearch } from "@/lib/types";

export function toProfessorRef(p: Professor): ProfessorRef {
  const paper = p.recent_papers[0];
  return { name: p.name ?? "Professor", affiliation: p.affiliations[0] ?? null, paper_title: paper?.title ?? null, paper_year: paper?.year ?? null };
}

export function SourceNote({ result }: { result: ProfessorSearch }) {
  if (result.source === "sample") {
    return (
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        Semantic Scholar is rate-limiting or unreachable right now, so these are <strong>fictional sample researchers</strong> to
        show how the finder works. Try again in a minute for real results.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      From Semantic Scholar{result.source === "cache" ? " (cached within the last 7 days)" : ""} for &ldquo;{result.query}&rdquo;.
      Ranked by relevance, recency and citations; BITS Pilani and UAE researchers are highlighted.
    </p>
  );
}

export function ProfessorCard({ p, onDraftEmail }: { p: Professor; onDraftEmail?: (p: Professor) => void }) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        p.highlight && "border-primary/40 bg-primary/[0.03]"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-hidden>
          {initials(p.name ?? "?")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{p.name}</h3>
            {p.highlight && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                {p.highlight}
              </span>
            )}
          </div>
          {p.affiliations.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-4" aria-hidden /> {p.affiliations.slice(0, 2).join(" · ")}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {[p.topics.slice(0, 3).join(", "), p.h_index != null && `h-index ${p.h_index}`, p.citation_count != null && `${p.citation_count.toLocaleString()} citations`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {p.recent_papers.map((paper, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {paper.url ? (
                <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {paper.title}
                </a>
              ) : (
                paper.title
              )}
              <span className="text-xs text-muted-foreground">
                {" "}
                · {[paper.venue, paper.year].filter(Boolean).join(", ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {onDraftEmail && (
          <Button size="sm" onClick={() => onDraftEmail(p)}>
            <Mail /> Draft cold email
          </Button>
        )}
        {p.profile_url && (
          <Button size="sm" variant="ghost" asChild>
            <a href={p.profile_url} target="_blank" rel="noopener noreferrer">
              Profile <ExternalLink />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

export function ProfessorSkeleton() {
  return <div className="h-44 animate-pulse rounded-xl bg-muted" aria-hidden />;
}
