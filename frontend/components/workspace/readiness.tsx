"use client";

/*
 * Application readiness (DESIGN.md "Readiness"): one score per Application File from its
 * checklist (60%) and application documents (40%; an unreviewed AI draft counts half),
 * computed by the API. Status colours follow the status semantics: emerald = ready,
 * rose = at risk, primary otherwise. A plain bar, no animation beyond the width transition.
 */
import { cn } from "@/lib/utils";
import type { Readiness } from "@/lib/types";

const STATUS: Record<Readiness["status"], { label: string; text: string; bar: string }> = {
  ready: { label: "Ready", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  at_risk: { label: "At risk", text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500" },
  on_track: { label: "On track", text: "text-muted-foreground", bar: "bg-primary" },
  empty: { label: "Not started", text: "text-muted-foreground", bar: "bg-primary" },
};

function parts(r: Readiness) {
  const out = [];
  if (r.checklist_total) out.push(`${r.checklist_done}/${r.checklist_total} checklist`);
  if (r.docs_total) {
    const drafts = r.docs_ai_drafts ? ` · ${r.docs_ai_drafts} AI draft${r.docs_ai_drafts === 1 ? "" : "s"} to review` : "";
    out.push(`${r.docs_ready}/${r.docs_total} documents ready${drafts}`);
  }
  return out.join(" · ");
}

/** `compact`: score + bar only (dashboard rows); otherwise also the breakdown and next step. */
export function ReadinessMeter({ readiness: r, compact = false, className }: { readiness: Readiness; compact?: boolean; className?: string }) {
  const s = STATUS[r.status];
  const detail = parts(r);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Readiness <span className="font-semibold tabular-nums text-foreground">{r.score}%</span>
        </span>
        <span className={cn("font-medium", s.text)}>{s.label}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Application readiness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={r.score}
        aria-valuetext={`${r.score}%, ${s.label}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300", s.bar)} style={{ width: `${r.score}%` }} />
      </div>
      {!compact && (detail || r.next_step) && (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {detail && <span>{detail}</span>}
          {r.next_step && r.status !== "ready" && (
            <span className="line-clamp-1">
              Next: <span className="text-foreground">{r.next_step}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
