"use client";

import { Sparkles } from "lucide-react";
import { EligibilityPill } from "@/components/opportunity/eligibility-badge";
import { cn } from "@/lib/utils";

/*
 * Product preview for the home hero: simplified, display-only versions of what the
 * seeded demo student (student@demo.com) sees, i.e. their top match (MBZUAI UGRIP,
 * deadline 33 days out in the seed) and the seeded "Application Checklist".
 * Decorative: inert and hidden from assistive tech.
 */

const SURFACE =
  "rounded-xl border border-border bg-raised shadow-[0_24px_48px_-16px_rgb(15_23_42/0.22)] dark:border-white/12 dark:shadow-[0_28px_56px_-16px_rgb(0_0_0/0.7)]";

const CHECKLIST = [
  { label: "CV", done: true },
  { label: "Statement of Purpose", done: false },
  { label: "Two recommendation letters", done: false },
];

/** Gold, serif take on the match score, for the hero only (the app keeps MatchScore). */
function PreviewScore({ score, size = 52 }: { score: number; size?: number }) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 text-gold">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-heading text-lg font-semibold tabular-nums text-honor">
        {score}
      </span>
    </div>
  );
}

function MainCard({ className }: { className?: string }) {
  return (
    <div data-preview-card className={cn(SURFACE, "flex flex-col gap-4 p-6", className)}>
      <div className="flex items-center gap-4">
        <PreviewScore score={100} />
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top match</span>
          <span className="text-sm text-muted-foreground">Research internship</span>
        </div>
      </div>
      <h3 className="font-heading text-lg font-semibold leading-snug tracking-tight">
        MBZUAI Undergraduate Research Internship Program
      </h3>
      <p className="text-sm text-muted-foreground">33 days left &middot; Abu Dhabi, UAE</p>
      <div className="flex flex-wrap items-center gap-2">
        <EligibilityPill verdict="eligible" />
        <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-honor ring-1 ring-inset ring-gold/40">
          <Sparkles className="size-4" aria-hidden />
          Faculty endorsed
        </span>
      </div>
    </div>
  );
}

function ChecklistCard({ className }: { className?: string }) {
  const done = 1;
  const total = 5;
  return (
    <div data-preview-card className={cn(SURFACE, "flex flex-col gap-3 p-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Application checklist</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done} of {total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="flex flex-col gap-2">
        {CHECKLIST.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                item.done ? "border-primary bg-primary text-primary-foreground" : "border-input"
              )}
            >
              {item.done && (
                <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2.5 6.5l2.2 2.2L9.5 3.8" />
                </svg>
              )}
            </span>
            <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HeroPreview() {
  return (
    <div
      aria-hidden
      // React 18 has no `inert` prop; set the attribute directly so nothing inside is focusable or clickable.
      ref={(el) => el?.setAttribute("inert", "")}
      className="relative mx-auto w-full max-w-[420px] select-none lg:mx-0 lg:ml-auto lg:mr-20 lg:w-fit lg:max-w-none lg:pl-12"
    >
      <MainCard className="lg:w-[360px]" />
      {/* Overlaps only the main card's bottom padding (16px of its 24px), never its text. */}
      <ChecklistCard className="relative z-10 -ml-12 -mt-4 hidden w-[260px] lg:flex" />
    </div>
  );
}
