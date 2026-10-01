"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { DEGREE_LABELS, TYPE_LABELS, timeAgo } from "@/lib/format";
import { useRequireRole } from "@/lib/auth";
import { useCreateEndorsement, useDeleteEndorsement, useMyEndorsements } from "@/lib/engagement";
import { useOpportunities } from "@/lib/opportunities";
import { useTrackRoute } from "@/lib/state";
import type { Opportunity } from "@/lib/types";

export default function EndorsePage() {
  const { allowed } = useRequireRole(["faculty", "admin"], "/faculty/endorse");
  useTrackRoute("/faculty/endorse");
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data: opps } = useOpportunities({ q: debounced || undefined });
  const { data: mine } = useMyEndorsements();
  const create = useCreateEndorsement();
  const remove = useDeleteEndorsement();

  const [picked, setPicked] = React.useState<Opportunity | null>(null);
  const [note, setNote] = React.useState("");
  const [degree, setDegree] = React.useState("any");
  const [year, setYear] = React.useState("any");
  const [major, setMajor] = React.useState("");

  if (!allowed) return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    try {
      const res = await create.mutateAsync({
        opportunity_id: picked.id,
        note: note || undefined,
        target_degree_level: degree === "any" ? null : degree,
        target_year: year === "any" ? null : Number(year),
        target_major: major.trim() || null,
      });
      toast.success(`Endorsed. ${res.notified} matching student${res.notified === 1 ? "" : "s"} notified.`);
      setPicked(null);
      setNote("");
      setMajor("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't endorse");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-6 text-violet-600 dark:text-violet-400" aria-hidden /> Endorse opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Recommend an opportunity to the students it suits. They get a notification, the card shows your note, and it ranks
          higher in their matches.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Pick an opportunity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, organization or field" className="pl-9" aria-label="Search opportunities" />
            </div>
            <ul className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
              {(opps ?? []).slice(0, 40).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(o)}
                    aria-pressed={picked?.id === o.id}
                    className={cn("flex w-full flex-col items-start rounded-lg border p-2.5 text-left text-sm hover:bg-muted/60", picked?.id === o.id && "border-violet-500 bg-violet-500/5")}
                  >
                    <span className="font-medium">{o.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[o.type]} · {o.organization} · {o.endorsements.length ? `${o.endorsements.length} endorsement(s)` : "not endorsed yet"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Who is it for?</CardTitle>
              <CardDescription>{picked ? picked.title : "Choose an opportunity first."}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-note">Note to students</Label>
                  <Textarea id="e-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Strong fit for 3rd-years in our robotics electives; apply early." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Degree level</Label>
                    <Select value={degree} onValueChange={setDegree}>
                      <SelectTrigger className="w-full" aria-label="Target degree level"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {["bachelors", "masters", "phd"].map((d) => <SelectItem key={d} value={d}>{DEGREE_LABELS[d]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Year</Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="w-full" aria-label="Target year"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-major">Major or field (optional)</Label>
                  <Input id="e-major" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="e.g. Computer Science" />
                </div>
                <Button type="submit" disabled={!picked || create.isPending}>
                  <Sparkles /> Endorse and notify students
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your endorsements</CardTitle>
            </CardHeader>
            <CardContent>
              {!mine?.length ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/opportunities/${e.opportunity_id}`} className="font-medium hover:underline">{e.opportunity_title}</Link>
                        <p className="text-xs text-muted-foreground">
                          {[e.target_degree_level && DEGREE_LABELS[e.target_degree_level], e.target_year && `Year ${e.target_year}`, e.target_major].filter(Boolean).join(" · ") || "All students"} · {timeAgo(e.created_at)}
                        </p>
                        {e.note && <p className="mt-1 text-xs">“{e.note}”</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove endorsement"
                        onClick={async () => {
                          await remove.mutateAsync(e.id);
                          toast.success("Endorsement removed");
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
