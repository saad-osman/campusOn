"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, CircleHelp, CircleSlash, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERDICT_LABELS } from "@/lib/format";
import type { EligibilityCheck, Verdict } from "@/lib/types";

export const VERDICT_STYLES: Record<Verdict, string> = {
  eligible: "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300",
  partially_eligible: "bg-amber-500/12 text-amber-800 ring-amber-600/25 dark:text-amber-300",
  not_eligible: "bg-rose-500/12 text-rose-700 ring-rose-600/25 dark:text-rose-300",
  unknown: "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
};

const ICONS: Record<Verdict, React.ElementType> = {
  eligible: CheckCircle2,
  partially_eligible: CircleAlert,
  not_eligible: CircleSlash,
  unknown: CircleHelp,
};

export function EligibilityPill({ verdict, className }: { verdict: Verdict; className?: string }) {
  const Icon = ICONS[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        VERDICT_STYLES[verdict],
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

/** Lines explaining a verdict: blockers first, then gaps, unknowns, and what's met. */
export function EligibilityExplanation({ check }: { check: EligibilityCheck }) {
  const groups: { items: string[]; label: string; className: string }[] = [
    { items: check.blocking, label: "Rules you out", className: "text-rose-700 dark:text-rose-300" },
    { items: check.missing, label: "Missing", className: "text-amber-800 dark:text-amber-300" },
    { items: check.unknown, label: "Can't check yet", className: "text-muted-foreground" },
    { items: check.met, label: "You meet", className: "text-emerald-700 dark:text-emerald-300" },
    { items: check.notes, label: "Also needed", className: "text-muted-foreground" },
  ];
  const nonEmpty = groups.filter((g) => g.items.length);
  if (!nonEmpty.length) {
    return <p className="text-sm text-muted-foreground">This listing doesn&apos;t state checkable requirements.</p>;
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      {nonEmpty.map((g) => (
        <div key={g.label}>
          <p className={cn("text-xs font-semibold uppercase tracking-wide", g.className)}>{g.label}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {g.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Badge that expands in place to explain the verdict (Feature 1). */
export function EligibilityBadge({ check }: { check: EligibilityCheck }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex w-fit items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <EligibilityPill verdict={check.verdict} />
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        <span className="sr-only">{open ? "Hide" : "Show"} eligibility details</span>
      </button>
      {open && (
        <div id={id} className="rounded-md border bg-muted/40 p-3" onClick={(e) => e.stopPropagation()}>
          <EligibilityExplanation check={check} />
        </div>
      )}
    </div>
  );
}
