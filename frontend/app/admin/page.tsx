"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, Download, ExternalLink, Mail, Plus, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCard, HBarChart, StackedColumns, TwoLineChart, WeeklyColumns } from "@/components/admin/charts";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { FUNDING_LABELS, REGION_LABELS, TYPE_LABELS, timeAgo } from "@/lib/format";
import { useRequireRole } from "@/lib/auth";
import { useReviewQueue, useSendDigestNow } from "@/lib/engagement";
import {
  useAnalytics,
  useArchiveSweep,
  useCreateSource,
  usePatchSource,
  useScrapeRuns,
  useScrapeSource,
  useSources,
  type SourceRow,
} from "@/lib/admin";
import { useTrackRoute } from "@/lib/state";
import type { FundingType, OpportunityType, Region } from "@/lib/types";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function AddSourceDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [region, setRegion] = React.useState("uae");
  const create = useCreateSource();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Add source
      </Button>
      <DialogContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await create.mutateAsync({ name, base_url: url, region });
              toast.success("Source added. Run a scrape to pull its listings.");
              setOpen(false);
              setName("");
              setUrl("");
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "Couldn't add the source");
            }
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Add a source</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-name">Name</Label>
            <Input id="src-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. University of Sharjah Research Office" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-url">Public page URL</Label>
            <Input id="src-url" required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">robots.txt is checked before every fetch; disallowed pages are skipped.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-full" aria-label="Region"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(REGION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>Add source</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function statusTone(status: string | null) {
  if (!status) return "text-muted-foreground";
  if (status === "ok" || status === "unchanged") return "text-emerald-700 dark:text-emerald-400";
  return "text-rose-700 dark:text-rose-400";
}

function SourcesTable() {
  const { data: sources, isLoading } = useSources();
  const patch = usePatchSource();
  const scrape = useScrapeSource();
  const [filter, setFilter] = React.useState("");
  const [running, setRunning] = React.useState<string | null>(null);
  const rows = (sources ?? []).filter((s) => !filter || `${s.name} ${s.region} ${s.base_url}`.toLowerCase().includes(filter.toLowerCase()));

  async function runScrape(s: SourceRow) {
    setRunning(s.id);
    try {
      const run = await scrape.mutateAsync(s.id);
      const d = run.detail as { action?: string; error?: string; http_status?: number };
      if (run.status === "ok") toast.success(`${s.name}: ${d.action ?? "checked"}`);
      else toast.error(`${s.name}: ${d.error ?? `HTTP ${d.http_status ?? "error"}`}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Scrape failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-label="Sources">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Sources</h2>
          <p className="text-xs text-muted-foreground">Re-scraped every 6 hours; unchanged pages are never re-processed.</p>
        </div>
        <div className="flex gap-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sources" className="h-8 w-44" aria-label="Filter sources" />
          <AddSourceDialog />
        </div>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Region</th>
              <th className="py-2 pr-3 font-medium">Last checked</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Active</th>
              <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading&hellip;</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="max-w-64 py-2 pr-3">
                    <a href={s.base_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      <span className="truncate">{s.name}</span> <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </a>
                  </td>
                  <td className="py-2 pr-3 text-xs uppercase text-muted-foreground">{s.region}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{timeAgo(s.last_checked)}</td>
                  <td className={cn("py-2 pr-3 text-xs", statusTone(s.last_status))}>{s.last_status ?? "never run"}</td>
                  <td className="py-2 pr-3">
                    <Switch checked={s.active} aria-label={`${s.name} active`} onCheckedChange={(v) => patch.mutate({ id: s.id, active: v })} />
                  </td>
                  <td className="py-2 text-right">
                    <Button size="xs" variant="ghost" disabled={running === s.id} onClick={() => runScrape(s)}>
                      <RefreshCw className={cn(running === s.id && "animate-spin")} /> {running === s.id ? "Scraping…" : "Scrape now"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunsTable() {
  const { data: runs } = useScrapeRuns();
  const { data: sources } = useSources();
  const names = new Map((sources ?? []).map((s) => [s.id, s.name]));
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-label="Recent scrape runs">
      <h2 className="text-sm font-semibold">Recent scrape runs</h2>
      {!runs?.length ? (
        <p className="text-sm text-muted-foreground">No runs yet. Use &ldquo;Scrape now&rdquo; on a source.</p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 pr-3 font-medium">Fetched</th>
                <th className="py-2 pr-3 font-medium">New</th>
                <th className="py-2 pr-3 font-medium">Updated</th>
                <th className="py-2 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{names.get(r.source_id ?? "") ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{timeAgo(r.started_at)}</td>
                  <td className={cn("py-2 pr-3 text-xs", r.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
                    {r.status === "ok" ? String((r.detail as { action?: string }).action ?? "ok") : String((r.detail as { error?: string }).error ?? "failed").slice(0, 60)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.pages_fetched}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.new_count}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.updated_count}</td>
                  <td className="py-2 tabular-nums">{r.failed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BrokenList() {
  const { data } = useReviewQueue("broken");
  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5" aria-label="Broken or rejected listings">
      <h2 className="text-sm font-semibold">Broken or rejected listings</h2>
      <p className="text-xs text-muted-foreground">Hidden from students. Links that returned 404/410 twice, or that a reviewer rejected.</p>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {data.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{o.title}</span>
              <Link href="/faculty/review" className="shrink-0 text-xs text-muted-foreground hover:underline">Review</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminPage() {
  const { allowed } = useRequireRole(["admin"], "/admin");
  useTrackRoute("/admin");
  const { data, isLoading } = useAnalytics();
  const digest = useSendDigestNow();
  const sweep = useArchiveSweep();

  if (!allowed) return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  const h = data?.headline;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Coverage, quality and student outcomes across ScholarRadar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={digest.isPending}
            onClick={async () => {
              const r = await digest.mutateAsync();
              toast.success(`Digest sent to ${r.in_app} students (${r.email} by email, ${r.telegram} on Telegram)`);
            }}
          >
            <Mail /> {digest.isPending ? "Sending…" : "Send digest now"}
          </Button>
          <Button
            variant="outline"
            disabled={sweep.isPending}
            onClick={async () => {
              const r = await sweep.mutateAsync();
              toast.success(`${r.archived_count} listing${r.archived_count === 1 ? "" : "s"} marked expired`);
            }}
          >
            <Archive /> Run expiry sweep
          </Button>
          <Button asChild>
            <a href="/api/admin/analytics.csv" download>
              <Download /> Export CSV
            </a>
          </Button>
        </div>
      </header>

      {isLoading || !data || !h ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-busy>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Sources monitored" value={h.sources_monitored} />
            <Stat label="Active opportunities" value={h.active_opportunities} hint={`${h.pending_review} awaiting review`} />
            <Stat label="Verified by faculty" value={`${h.verified_pct}%`} hint="of active listings" />
            <Stat label="Avg. extraction confidence" value={h.avg_confidence.toFixed(2)} hint="0–1, active + pending" />
            <Stat label="Students with an application" value={h.students_with_application} hint={`of ${h.students_total} students`} />
          </div>

          {data.success_stories.length > 0 && (
            <section className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-card to-card p-5" aria-label="Success stories">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> Success stories
              </h2>
              <p className="mb-2 text-xs text-muted-foreground">From outcomes students chose to share anonymously.</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.success_stories.map((s) => (
                  <li key={s} className="rounded-lg bg-background/60 p-3 text-sm">{s}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="New opportunities per week" subtitle="Last 12 weeks, by first discovery">
              <WeeklyColumns data={data.new_per_week} valueLabel="New opportunities" />
            </ChartCard>
            <ChartCard title="Saves and applications per week" subtitle="Applications = cards moved to Submitted, plus reported outcomes">
              <TwoLineChart data={data.activity_per_week} a={{ key: "saves", label: "Saves" }} b={{ key: "applications", label: "Applications" }} />
            </ChartCard>
            <ChartCard title="Opportunities by type">
              <HBarChart data={data.by_type} label={(n) => TYPE_LABELS[n as OpportunityType] ?? n} />
            </ChartCard>
            <ChartCard title="Opportunities by region">
              <HBarChart data={data.by_region} label={(n) => REGION_LABELS[n as Region] ?? n} />
            </ChartCard>
            <ChartCard title="Opportunities by field" subtitle="Top 10; a listing can count in several fields">
              <HBarChart data={data.by_field} />
            </ChartCard>
            <ChartCard title="Opportunities by funding">
              <HBarChart data={data.by_funding} label={(n) => FUNDING_LABELS[n as FundingType] ?? n} />
            </ChartCard>
            <ChartCard title="What students are interested in" subtitle="Top 10 research interests across student profiles">
              <HBarChart data={data.top_interests} valueLabel="Students" />
            </ChartCard>
            <ChartCard title="Outcomes per term" subtitle="Reported results, by academic term">
              {data.outcomes_per_term.length ? (
                <StackedColumns
                  data={data.outcomes_per_term}
                  xKey="term"
                  series={[
                    { key: "accepted", label: "Accepted", color: "var(--series-1)" },
                    { key: "waitlisted", label: "Waitlisted", color: "var(--series-2)" },
                    { key: "rejected", label: "Rejected", color: "var(--series-3)" },
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No outcomes reported yet.</p>
              )}
            </ChartCard>
          </div>
        </>
      )}

      <SourcesTable />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <RunsTable />
        <BrokenList />
      </div>
    </div>
  );
}
