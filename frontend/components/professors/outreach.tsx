"use client";

/*
 * Professor outreach tracker (DESIGN.md "Outreach"): "I emailed them" on a professor card
 * logs the email; the Professors page lists everyone contacted with a follow-up date 7 days
 * later. When it's due, a notification appears (created by the API when the bell loads).
 * Status colours follow the status semantics: rose = follow-up due, emerald = replied.
 */
import * as React from "react";
import Link from "next/link";
import { Check, Mail, MailCheck, MoreHorizontal, Reply, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import { useDeleteOutreach, useLogOutreach, useOutreach, useUpdateOutreach } from "@/lib/outreach";
import type { Outreach, Professor } from "@/lib/types";
import { cn } from "@/lib/utils";

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The open entry for this professor, if any (matched by Semantic Scholar id, else name). */
function useEntryFor(p: Professor) {
  const { data } = useOutreach();
  return data?.find((o) => o.status !== "closed" && (o.author_id ? o.author_id === p.author_id : o.professor_name === p.name));
}

/** On a professor card: log the email, or show where it stands. Hidden for sample researchers. */
export function LogOutreachButton({ p, opportunityId }: { p: Professor; opportunityId?: string }) {
  const entry = useEntryFor(p);
  const log = useLogOutreach();
  if (p.sample || !p.name) return null;
  if (entry) {
    return (
      <Link
        href="/professors#outreach"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {entry.status === "replied" ? <Reply className="size-4" aria-hidden /> : <MailCheck className="size-4" aria-hidden />}
        {entry.status === "replied"
          ? "Replied"
          : entry.follow_up_due
            ? "Follow-up due"
            : `Emailed · follow up ${entry.follow_up_on ? shortDate(entry.follow_up_on) : ""}`}
      </Link>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={log.isPending}
      onClick={async () => {
        try {
          const o = await log.mutateAsync({
            professor_name: p.name!,
            affiliation: p.affiliations[0] ?? null,
            author_id: p.author_id,
            profile_url: p.profile_url,
            paper_title: p.recent_papers[0]?.title ?? null,
            opportunity_id: opportunityId ?? null,
          });
          toast.success(`Logged. We'll remind you to follow up on ${o.follow_up_on ? shortDate(o.follow_up_on) : "a week from now"}.`);
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "Couldn't log it");
        }
      }}
    >
      <Send /> I emailed them
    </Button>
  );
}

function StatusLine({ o }: { o: Outreach }) {
  if (o.status === "replied") return <span className="font-medium text-emerald-700 dark:text-emerald-300">Replied</span>;
  if (o.status === "closed") return <span className="text-muted-foreground">Closed</span>;
  if (o.follow_up_due) return <span className="font-medium text-rose-700 dark:text-rose-300">Follow-up due</span>;
  const d = o.days_until_follow_up ?? 0;
  return (
    <span className="text-muted-foreground">
      Follow up in {d} day{d === 1 ? "" : "s"}
    </span>
  );
}

function Row({ o }: { o: Outreach }) {
  const update = useUpdateOutreach();
  const del = useDeleteOutreach();
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update it");
    }
  };
  const busy = update.isPending || del.isPending;
  return (
    <li className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between", o.status === "closed" && "opacity-70")}>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {o.profile_url ? (
            <a href={o.profile_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {o.professor_name}
            </a>
          ) : (
            o.professor_name
          )}
          {o.affiliation && <span className="font-normal text-muted-foreground"> · {o.affiliation}</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          Emailed {shortDate(o.sent_on)}
          {o.follow_ups > 0 && ` · followed up ${o.follow_ups}×`}
          {o.opportunity_title && o.opportunity_id && (
            <>
              {" · about "}
              <Link href={`/opportunities/${o.opportunity_id}`} className="underline-offset-2 hover:underline">
                {o.opportunity_title}
              </Link>
            </>
          )}
        </p>
        <p className="text-xs">
          <StatusLine o={o} />
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {o.status === "sent" && (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => update.mutateAsync({ id: o.id, status: "replied" }), "Marked as replied")}>
              <Reply /> Got a reply
            </Button>
            <Button
              size="sm"
              variant={o.follow_up_due ? "default" : "ghost"}
              disabled={busy}
              onClick={() => run(() => update.mutateAsync({ id: o.id, followed_up: true }), "Follow-up logged. Next reminder in a week.")}
            >
              <Mail /> I followed up
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`More for ${o.professor_name}`} disabled={busy}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {o.status !== "sent" && (
              <DropdownMenuItem onClick={() => run(() => update.mutateAsync({ id: o.id, status: "sent" }), "Reopened")}>
                <Check /> Still waiting
              </DropdownMenuItem>
            )}
            {o.status !== "closed" && (
              <DropdownMenuItem onClick={() => run(() => update.mutateAsync({ id: o.id, status: "closed" }), "Closed")}>
                <X /> Close (no more follow-ups)
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => run(() => del.mutateAsync(o.id), "Removed")}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** "Your outreach" on the Professors page (anchor #outreach, linked from reminders). */
export function OutreachList() {
  const { data } = useOutreach();
  if (!data?.length) return null;
  const due = data.filter((o) => o.follow_up_due).length;
  const waiting = data.filter((o) => o.status === "sent").length;
  return (
    <Card id="outreach" className="scroll-mt-[calc(var(--header-h,3.5rem)+1rem)]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <MailCheck className="size-4" aria-hidden /> Your outreach
          </span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {waiting} waiting{due ? ` · ${due} follow-up${due === 1 ? "" : "s"} due` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="-my-3 divide-y">
          {data.map((o) => (
            <Row key={o.id} o={o} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
