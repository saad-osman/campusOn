"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FolderItem } from "@/components/motion/folder-float";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { ProjectIcon } from "@/components/workspace/project-icon";
import { initials, timeAgo } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/lib/auth";
import { useTrackRoute } from "@/lib/state";
import { useCreateWorkspace, useDocuments, useWorkspaces } from "@/lib/workspaces";
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { Workspace, WorkspaceTemplate } from "@/lib/types";

const TEMPLATES: { value: WorkspaceTemplate; label: string; hint: string }[] = [
  { value: "blank", label: "Blank", hint: "Start from nothing." },
  { value: "single_application", label: "Single application", hint: "SOP, cold email, and checklist auto-created." },
  { value: "scholarship_hunt", label: "Scholarship hunt", hint: "Tracker and a notes document auto-created." },
];

function NewFileDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [template, setTemplate] = React.useState<WorkspaceTemplate>("blank");
  const [error, setError] = React.useState<string | null>(null);
  const create = useCreateWorkspace();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ws = await create.mutateAsync({ name, description: description || undefined, template });
      setOpen(false);
      setName("");
      setDescription("");
      setTemplate("blank");
      router.push(`/files/${ws.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ New File</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New Application File</DialogTitle>
            <DialogDescription>A workspace for one application or a group of related ones.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer 2027 AI Internships"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Template</Label>
              <RadioGroup value={template} onValueChange={(v: string) => setTemplate(v as WorkspaceTemplate)}>
                {TEMPLATES.map((t) => (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary"
                  >
                    <RadioGroupItem value={t.value} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.hint}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create file"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FOLDER = { width: 180, height: 128, radius: 14, tab: 14 } as const;

// matter-js ships only to /files; the placeholder holds the folder's exact footprint.
const FolderFloat = dynamic(() => import("@/components/motion/folder-float"), {
  ssr: false,
  loading: () => <div aria-hidden style={{ width: FOLDER.width, height: FOLDER.height + FOLDER.tab }} />,
});

const MAX_PILLS = 6;
// 24 characters keeps a pill near 190px, so two share a row of the cloud (see `spread`).
const shorten = (s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s);

/** One Application File: its documents float out of the folder; the name opens the file. */
/** `enterIndex`: fade the card in, staggered by position (like Discover); static under reduced motion. */
function FileCard({ ws, spread, enterIndex }: { ws: Workspace; spread: number; enterIndex: number }) {
  const reduced = usePrefersReducedMotion();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // Documents load lazily: on hover, on focus inside the card, or when the folder opens.
  const [wantDocs, setWantDocs] = React.useState(false);
  const { data: docs } = useDocuments(wantDocs ? ws.id : undefined);
  // Shift an edge card's cloud sideways so its pills (and the hover bridge, ±spread + 16px)
  // stay inside the viewport instead of causing horizontal scroll.
  // (shadcn's Card can't take a ref in React 18, so the element comes from its events.)
  const cardEl = React.useRef<HTMLElement | null>(null);
  const [shift, setShift] = React.useState(0);
  const prepare = (el?: HTMLElement) => {
    setWantDocs(true);
    if (el) cardEl.current = el;
    const r = cardEl.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const half = spread + 16;
    const edge = 8;
    const right = cx + half - (document.documentElement.clientWidth - edge);
    const left = edge - (cx - half);
    setShift(right > 0 ? -Math.ceil(right) : left > 0 ? Math.ceil(left) : 0);
  };
  const docsTab = `/files/${ws.id}?tab=documents`;

  const items = React.useMemo<FolderItem[]>(() => {
    if (!docs) return [{ label: "Loading…", value: "loading", disabled: true }];
    if (docs.length === 0) return [{ label: "No documents yet", value: "empty", href: docsTab }];
    const toItem = (d: (typeof docs)[number]): FolderItem => ({
      label: shorten(d.title),
      value: d.id,
      href: `/files/${ws.id}/docs/${d.id}`,
    });
    if (docs.length <= MAX_PILLS) return docs.map(toItem);
    return [...docs.slice(0, MAX_PILLS - 1).map(toItem), { label: `+${docs.length - (MAX_PILLS - 1)} more`, value: "more", href: docsTab }];
  }, [docs, docsTab, ws.id]);

  return (
    <Card
      className={cn(
        "h-full overflow-visible transition-colors hover:border-primary/50",
        open && "relative z-30",
        !reduced && "animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
      )}
      style={reduced ? undefined : ({ animationDelay: `${Math.min(enterIndex, 8) * 60}ms`, "--tw-ease": EASE_OUT } as React.CSSProperties)}
      onPointerEnter={(e) => prepare(e.currentTarget)}
      onFocusCapture={(e) => prepare(e.currentTarget)}
    >
      <div className="flex justify-center px-4">
        <FolderFloat
          items={items}
          label={ws.name}
          sublabel={`${ws.document_count} document${ws.document_count === 1 ? "" : "s"}`}
          trigger="hover"
          physics
          drift={0.5}
          openDuration={520}
          stagger={45}
          bounce={0.3}
          closeOnSelect
          width={FOLDER.width}
          height={FOLDER.height}
          radius={FOLDER.radius}
          spread={spread}
          shift={shift}
          lift={26}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) prepare();
          }}
          onSelect={(item) => {
            if (item.href) router.push(item.href);
          }}
        />
      </div>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ProjectIcon icon={ws.icon} />
          <CardTitle className="text-base">
            <Link
              href={`/files/${ws.id}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ws.name}
            </Link>
          </CardTitle>
          {ws.archived && <Badge variant="outline">archived</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
        {ws.description && <p className="line-clamp-2 text-xs">{ws.description}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex -space-x-2" aria-label={`Members: ${ws.members.map((m) => m.name).join(", ")}`}>
            {ws.members.slice(0, 4).map((m) => (
              <span
                key={m.user_id}
                title={m.name}
                className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-foreground"
              >
                {initials(m.name)}
              </span>
            ))}
            {ws.members.length > 4 && (
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px]">
                +{ws.members.length - 4}
              </span>
            )}
          </div>
          <Badge variant="secondary">{ws.my_role}</Badge>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Opportunities</dt>
            <dd className="font-medium text-foreground">{ws.opportunity_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next deadline</dt>
            <dd className="font-medium text-foreground">
              {ws.nearest_deadline ? <DeadlineBadge deadline={ws.nearest_deadline} className="text-xs" /> : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last activity</dt>
            <dd className="font-medium text-foreground">{timeAgo(ws.last_activity_at)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function FilesPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: workspaces, isLoading } = useWorkspaces();
  useTrackRoute("/files");
  // Document clouds spread 210px each side (two ~190px pills per row, so six documents
  // make three rows, not six), 140px on narrow screens.
  const [spread, setSpread] = React.useState(210);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 559px)");
    const sync = () => setSpread(mq.matches ? 140 : 210);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    if (!userLoading && !user) router.replace("/login?next=/files");
  }, [user, userLoading, router]);

  if (userLoading || !user) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Application Files</h1>
          <p className="text-sm text-muted-foreground">Workspaces for your applications, solo or with teammates.</p>
        </div>
        <NewFileDialog />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading&hellip;</div>
      ) : !workspaces || workspaces.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No Application Files yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Create one to track an application with teammates, or open any opportunity and click{" "}
            <strong>Generate application kit</strong>; it makes a file for you.
          </p>
        </div>
      ) : (
        // Room for the first row's document clouds (FolderFloat) to rise into, clear of the
        // sticky nav: phones stack pills one per row (spread 140), so they need more.
        // Keyed on the loaded file list, so the entrance plays when it arrives or changes,
        // not on a background refetch of the same files.
        <div key={workspaces.map((w) => w.id).join(",")} className="grid gap-4 pt-40 sm:grid-cols-2 sm:pt-20 lg:grid-cols-3">
          {workspaces.map((ws, i) => (
            <FileCard key={ws.id} ws={ws} spread={spread} enterIndex={i} />
          ))}
        </div>
      )}
    </div>
  );
}
