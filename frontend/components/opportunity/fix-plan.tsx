"use client";

/*
 * Eligibility fix plan (DESIGN.md "Fix plan"): under the eligibility explanation, each gap
 * becomes a dated step planned backwards from the deadline (services/fix_plan.py). Profile
 * gaps link to Settings; hard blocks are listed without a date. "Add to an Application File"
 * appends the steps to that File's checklist, so they count towards its readiness.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, ListPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSelect, NEW_FILE } from "@/components/opportunity/actions";
import { ApiError } from "@/lib/api";
import { useApplyFixPlan, useFixPlan } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import type { FixStep, Opportunity } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_ICON = { profile: UserRound, action: CalendarClock, blocked: Ban } as const;

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Step({ step }: { step: FixStep }) {
  const Icon = KIND_ICON[step.kind];
  const title = step.link ? (
    <Link href={step.link} className="underline-offset-2 hover:underline">
      {step.title}
    </Link>
  ) : (
    step.title
  );
  return (
    <li className="flex gap-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", step.kind === "blocked" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className={cn("text-sm", step.kind === "blocked" ? "text-muted-foreground" : "font-medium")}>{title}</span>
          {step.due && (
            <span className={cn("text-xs tabular-nums", step.urgent ? "font-medium text-rose-700 dark:text-rose-300" : "text-muted-foreground")}>
              {step.urgent ? "Do it now" : `by ${shortDate(step.due)}`}
            </span>
          )}
        </div>
        {step.detail && <span className="text-xs text-muted-foreground">{step.detail}</span>}
      </div>
    </li>
  );
}

function AddPlanDialog({ opp, open, onOpenChange }: { opp: Opportunity; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [fileId, setFileId] = React.useState(NEW_FILE);
  const apply = useApplyFixPlan(opp.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add the plan to an Application File</DialogTitle>
          <DialogDescription>
            The steps go into the File&apos;s checklist for this opportunity, with their dates, and count towards its readiness.
          </DialogDescription>
        </DialogHeader>
        <FileSelect value={fileId} onChange={setFileId} />
        <DialogFooter>
          <Button
            disabled={!fileId || apply.isPending}
            onClick={async () => {
              try {
                const res = await apply.mutateAsync(fileId === NEW_FILE ? null : fileId);
                onOpenChange(false);
                toast.success(res.added ? `Added ${res.added} step${res.added === 1 ? "" : "s"} to ${res.workspace_name}` : "Those steps are already in the checklist", {
                  action: { label: "Open", onClick: () => router.push(`/files/${res.workspace_id}/docs/${res.document_id}`) },
                });
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Couldn't add the plan");
              }
            }}
          >
            {apply.isPending ? "Adding…" : "Add plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shown in the Eligibility card when the verdict isn't "eligible". */
export function FixPlanSection({ opp }: { opp: Opportunity }) {
  const verdict = opp.eligibility_check?.verdict;
  const { data: plan, isLoading } = useFixPlan(opp.id, !!verdict && verdict !== "eligible");
  const [open, setOpen] = React.useState(false);
  if (!verdict || verdict === "eligible" || isLoading || !plan || !plan.steps.length) return null;
  const actionable = plan.steps.some((s) => s.kind !== "blocked");
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to close the gaps</p>
        {actionable && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <ListPlus /> Add to an Application File
          </Button>
        )}
      </div>
      <ol className="flex flex-col gap-3">
        {plan.steps.map((s) => (
          <Step key={s.key} step={s} />
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        {plan.has_deadline && plan.deadline
          ? `Dates count back from the ${formatDate(plan.deadline)} deadline.`
          : "No deadline is listed, so dates count from today. Check the official page."}
        {plan.blocked && (
          <>
            {" "}Some requirements can&apos;t change in time;{" "}
            <Link href={`/discover?q=${encodeURIComponent((opp.fields ?? []).slice(0, 2).join(" ") || opp.title)}`} className="underline underline-offset-2">
              look for similar opportunities
            </Link>
            .
          </>
        )}
      </p>
      {actionable && <AddPlanDialog opp={opp} open={open} onOpenChange={setOpen} />}
    </div>
  );
}
