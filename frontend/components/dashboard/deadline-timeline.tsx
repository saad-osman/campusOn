"use client";

/*
 * Dashboard deadline timeline (DESIGN.md "Deadline timeline"): the next 30 days as a track
 * with a Today marker and week ticks. Each saved opportunity closing in that window is a
 * marker placed by days left and coloured by urgency (rose <= 7 days, amber <= 14, muted
 * otherwise); same-day markers stack. Plain divs and tokens: no chart library, no gradients.
 */
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/icon-tile";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { daysUntil, formatDate } from "@/lib/format";
import type { Opportunity } from "@/lib/types";
import { cn } from "@/lib/utils";

export const TIMELINE_DAYS = 30;

const urgency = (days: number) =>
  days <= 7 ? "bg-rose-500 ring-rose-500/30" : days <= 14 ? "bg-amber-500 ring-amber-500/30" : "bg-muted-foreground ring-muted-foreground/30";

function dayLabel(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function DeadlineTimeline({ saved }: { saved: Opportunity[] }) {
  const later = saved.filter((o) => (daysUntil(o.deadline) ?? -1) > TIMELINE_DAYS).length;
  const inRange = saved
    .map((o) => ({ o, days: daysUntil(o.deadline) }))
    .filter((x): x is { o: Opportunity; days: number } => x.days !== null && x.days >= 0 && x.days <= TIMELINE_DAYS)
    .sort((a, b) => a.days - b.days);

  if (!inRange.length) {
    // Nothing in the window: show what's coming later, so the cell still answers "what's next?".
    const upcoming = saved
      .map((o) => ({ o, days: daysUntil(o.deadline) }))
      .filter((x): x is { o: Opportunity; days: number } => x.days !== null && x.days > TIMELINE_DAYS)
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);
    return (
      <div className="flex flex-1 flex-col items-start gap-3">
        <IconTile icon={CalendarClock} />
        <p className="text-sm text-muted-foreground">
          Nothing you&apos;ve saved closes in the next {TIMELINE_DAYS} days.
          {upcoming.length ? " Your next saved deadlines:" : " Save opportunities and their deadlines appear here."}
        </p>
        {upcoming.length > 0 && (
          <ul className="flex w-full flex-col gap-2">
            {upcoming.map(({ o }) => (
              <li key={o.id} className="flex items-start justify-between gap-3">
                <Link href={`/opportunities/${o.id}`} className="line-clamp-2 text-sm font-medium underline-offset-2 hover:underline">
                  {o.title}
                </Link>
                <DeadlineBadge deadline={o.deadline} className="shrink-0" />
              </li>
            ))}
          </ul>
        )}
        <Button asChild size="sm" className="mt-auto">
          <Link href="/discover">Find opportunities</Link>
        </Button>
      </div>
    );
  }

  // Same-day markers stack upwards: index within their day.
  const stackIndex = new Map<string, number>();
  const perDay = new Map<number, number>();
  for (const { o, days } of inRange) {
    const n = perDay.get(days) ?? 0;
    stackIndex.set(o.id, n);
    perDay.set(days, n + 1);
  }
  const pct = (days: number) => (days / TIMELINE_DAYS) * 100;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="scrollbar-none -mx-1 overflow-x-auto overflow-y-hidden px-1">
        <div className="relative h-20 min-w-[30rem] px-3" role="list" aria-label={`Deadlines in the next ${TIMELINE_DAYS} days`}>
          {/* Track */}
          <div className="absolute inset-x-3 top-12 h-px bg-border" aria-hidden />
          {/* Today + week ticks */}
          {[0, 7, 14, 21, 28].map((d) => (
            <div key={d} className="absolute top-12 flex -translate-x-1/2 flex-col items-center" style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${pct(d) / 100})` }} aria-hidden>
              <span className={cn("w-px", d === 0 ? "h-3 bg-foreground" : "h-2 bg-border")} />
              <span className={cn("mt-1 text-[11px] tabular-nums", d === 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                {d === 0 ? "Today" : dayLabel(d)}
              </span>
            </div>
          ))}
          {/* Markers */}
          {inRange.map(({ o, days }) => {
            const label = `${o.title}, closes ${formatDate(o.deadline)} (${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} left`})`;
            return (
              <Link
                key={o.id}
                role="listitem"
                href={`/opportunities/${o.id}`}
                title={label}
                aria-label={label}
                className={cn(
                  "absolute size-3.5 -translate-x-1/2 rounded-full ring-4 transition-shadow hover:ring-8 focus-visible:outline-none focus-visible:ring-8 focus-visible:ring-ring",
                  urgency(days)
                )}
                style={{
                  left: `calc(0.75rem + (100% - 1.5rem) * ${pct(days) / 100})`,
                  top: `calc(3rem - 0.4375rem - ${(stackIndex.get(o.id) ?? 0) * 1.125}rem)`,
                }}
              />
            );
          })}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {inRange.slice(0, 3).map(({ o }) => (
          <li key={o.id} className="flex items-start justify-between gap-3">
            <Link href={`/opportunities/${o.id}`} className="line-clamp-2 text-sm font-medium underline-offset-2 hover:underline">
              {o.title}
            </Link>
            <DeadlineBadge deadline={o.deadline} className="shrink-0" />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
        <span>
          {inRange.length} deadline{inRange.length === 1 ? "" : "s"} in the next {TIMELINE_DAYS} days
          {later ? ` · ${later} later` : ""}
        </span>
        <span className="flex items-center gap-3" aria-label="Marker colours">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-500" aria-hidden />≤ 7 days</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" aria-hidden />≤ 14 days</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground" aria-hidden />later</span>
        </span>
      </div>
    </div>
  );
}
