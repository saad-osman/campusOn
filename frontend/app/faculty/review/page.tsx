"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { FUNDING_LABELS, TYPE_LABELS, timeAgo } from "@/lib/format";
import { useRequireRole } from "@/lib/auth";
import { useReviewAction, useReviewDetail, useReviewQueue, type ReviewKind } from "@/lib/engagement";
import { useTrackRoute } from "@/lib/state";
import type { Opportunity } from "@/lib/types";

const DEGREES = ["bachelors", "masters", "phd", "postdoc", "any"] as const;

type Form = {
  title: string;
  organization: string;
  type: Opportunity["type"];
  degree_levels: string[];
  fields: string;
  funding_type: Opportunity["funding_type"];
  funding_amount: string;
  location: string;
  is_remote: boolean;
  open_to_uae_residents: "yes" | "no" | "unknown";
  deadline: string;
  deadline_text: string;
  description_summary: string;
  eligibility: string;
};

function toForm(o: Opportunity): Form {
  return {
    title: o.title,
    organization: o.organization,
    type: o.type,
    degree_levels: o.degree_levels,
    fields: o.fields.join(", "),
    funding_type: o.funding_type,
    funding_amount: o.funding_amount ?? "",
    location: o.location ?? "",
    is_remote: o.is_remote,
    open_to_uae_residents: o.open_to_uae_residents === null ? "unknown" : o.open_to_uae_residents ? "yes" : "no",
    deadline: o.deadline ?? "",
    deadline_text: o.deadline_text ?? "",
    description_summary: o.description_summary ?? "",
    eligibility: JSON.stringify(o.eligibility ?? {}, null, 2),
  };
}

function Confidence({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  return (
    <span
      className={cn(
        "rounded px-1 text-[10px] font-semibold tabular-nums",
        value >= 0.7 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : value >= 0.4 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      )}
      title="Extraction confidence"
    >
      {pct}%
    </span>
  );
}

function Field({ label, conf, children, htmlFor }: { label: string; conf?: number; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs">
        {label} <Confidence value={conf} />
      </Label>
      {children}
    </div>
  );
}

function ReviewPanel({ id, onDone }: { id: string; onDone: () => void }) {
  const { data, isLoading } = useReviewDetail(id);
  const act = useReviewAction();
  const [form, setForm] = React.useState<Form | null>(null);
  React.useEffect(() => {
    if (data) setForm(toForm(data.opportunity));
  }, [data]);

  if (isLoading || !data || !form) return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy />;
  const opp = data.opportunity;
  const conf = opp.confidence ?? {};
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function submit(action: "approve" | "reject" | "save") {
    if (!form) return;
    let eligibility: Record<string, unknown>;
    try {
      eligibility = JSON.parse(form.eligibility || "{}");
    } catch {
      toast.error("Eligibility must be valid JSON");
      return;
    }
    const edits = {
      title: form.title,
      organization: form.organization,
      type: form.type,
      degree_levels: form.degree_levels,
      fields: form.fields.split(",").map((s) => s.trim()).filter(Boolean),
      funding_type: form.funding_type,
      funding_amount: form.funding_amount || null,
      location: form.location || null,
      is_remote: form.is_remote,
      open_to_uae_residents: form.open_to_uae_residents === "unknown" ? null : form.open_to_uae_residents === "yes",
      deadline: form.deadline || null,
      deadline_text: form.deadline_text || null,
      description_summary: form.description_summary || null,
      eligibility,
    };
    try {
      await act.mutateAsync({ id, action, edits });
      toast.success(action === "approve" ? "Approved and marked “Verified by BPDC faculty”" : action === "reject" ? "Rejected and hidden from students" : "Saved");
      if (action !== "save") onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the review");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="flex min-h-0 flex-col gap-2 rounded-xl border bg-muted/30 p-4" aria-label="Source page text">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Source page</span>
          {data.raw_url && (
            <a href={data.raw_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
              Open original <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {data.fetched_at && <p className="text-xs text-muted-foreground">Fetched {timeAgo(data.fetched_at)}</p>}
        <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs leading-relaxed">
          {data.raw_text || "No stored page text for this listing."}
        </pre>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-4" aria-label="Extracted fields">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extracted fields</span>
          <span className="text-xs text-muted-foreground">
            Overall confidence <Confidence value={opp.overall_confidence} />
          </span>
        </div>
        <Field label="Title" conf={conf.title} htmlFor="r-title">
          <Input id="r-title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Organization" conf={conf.organization} htmlFor="r-org">
          <Input id="r-org" value={form.organization} onChange={(e) => set({ organization: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.type} onValueChange={(v: string) => set({ type: v as Form["type"] })}>
              <SelectTrigger className="w-full" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Funding" conf={conf.funding_type}>
            <Select value={form.funding_type} onValueChange={(v: string) => set({ funding_type: v as Form["funding_type"] })}>
              <SelectTrigger className="w-full" aria-label="Funding"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FUNDING_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Deadline" conf={conf.deadline} htmlFor="r-deadline">
            <Input id="r-deadline" type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
          <Field label="Deadline as written" htmlFor="r-dltext">
            <Input id="r-dltext" value={form.deadline_text} onChange={(e) => set({ deadline_text: e.target.value })} />
          </Field>
          <Field label="Funding amount" htmlFor="r-amount">
            <Input id="r-amount" value={form.funding_amount} onChange={(e) => set({ funding_amount: e.target.value })} />
          </Field>
          <Field label="Location" conf={conf.location} htmlFor="r-loc">
            <Input id="r-loc" value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
        </div>
        <Field label="Degree levels" conf={conf.degree_levels}>
          <div className="flex flex-wrap gap-3">
            {DEGREES.map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={form.degree_levels.includes(d)}
                  onCheckedChange={(v) => set({ degree_levels: v === true ? [...form.degree_levels, d] : form.degree_levels.filter((x) => x !== d) })}
                />
                {d}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Fields (comma separated)" conf={conf.fields} htmlFor="r-fields">
          <Input id="r-fields" value={form.fields} onChange={(e) => set({ fields: e.target.value })} />
        </Field>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_remote} onCheckedChange={(v) => set({ is_remote: v })} /> Remote
          </label>
          <div className="flex items-center gap-2 text-sm">
            Open to UAE residents
            <Select value={form.open_to_uae_residents} onValueChange={(v: string) => set({ open_to_uae_residents: v as Form["open_to_uae_residents"] })}>
              <SelectTrigger size="sm" className="w-28" aria-label="Open to UAE residents"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Field label="Summary" htmlFor="r-summary">
          <Textarea id="r-summary" rows={3} value={form.description_summary} onChange={(e) => set({ description_summary: e.target.value })} />
        </Field>
        <Field label="Eligibility (JSON)" conf={conf.eligibility} htmlFor="r-elig">
          <Textarea id="r-elig" rows={8} className="font-mono text-xs" value={form.eligibility} onChange={(e) => set({ eligibility: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => submit("approve")} disabled={act.isPending}>
            <CheckCircle2 /> Approve &amp; verify
          </Button>
          <Button variant="outline" onClick={() => submit("save")} disabled={act.isPending}>Save edits</Button>
          <Button variant="destructive" onClick={() => submit("reject")} disabled={act.isPending}>
            <XCircle /> Reject
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/opportunities/${opp.id}`}>Student view</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function ReviewQueuePage() {
  const { allowed } = useRequireRole(["faculty", "admin"], "/faculty/review");
  useTrackRoute("/faculty/review");
  const [kind, setKind] = React.useState<ReviewKind>("pending");
  const { data: queue, isLoading } = useReviewQueue(kind);
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (queue && (!selected || !queue.some((o) => o.id === selected))) setSelected(queue[0]?.id ?? null);
  }, [queue, selected]);

  if (!allowed) return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="size-6 text-primary" aria-hidden /> Review queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Extractions under 70% confidence or without a deadline wait here. Approving adds &ldquo;Verified by BPDC faculty&rdquo;.
          </p>
        </div>
        <Tabs value={kind} onValueChange={(v) => { setKind(v as ReviewKind); setSelected(null); }}>
          <TabsList>
            <TabsTrigger value="pending">Needs review</TabsTrigger>
            <TabsTrigger value="unverified">Live, unverified</TabsTrigger>
            <TabsTrigger value="broken">Rejected / broken</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside aria-label="Queue" className="flex max-h-[40rem] flex-col gap-1 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)
          ) : !queue?.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here. Nice work.</p>
          ) : (
            queue.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelected(o.id)}
                aria-current={selected === o.id}
                className={cn("flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left text-sm transition-colors hover:bg-muted/60", selected === o.id && "border-primary bg-primary/5")}
              >
                <span className="line-clamp-2 font-medium leading-snug">{o.title}</span>
                <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{o.sources[0]?.name ?? o.organization}</span>
                  <Confidence value={o.overall_confidence} />
                </span>
              </button>
            ))
          )}
        </aside>
        <div className="min-w-0">
          {selected ? <ReviewPanel key={selected} id={selected} onDone={() => setSelected(null)} /> : null}
        </div>
      </div>
    </div>
  );
}
