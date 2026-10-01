"use client";

import * as React from "react";
import { parseServerTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/lib/auth";
import { usePatchState } from "@/lib/state";
import { useMembers, useWorkspace } from "@/lib/workspaces";
import {
  getConflict,
  useDocument,
  useDocumentVersions,
  usePatchDocument,
  useRestoreVersion,
} from "@/lib/workspaces";
import type { DocumentConflict } from "@/lib/workspaces";

type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error";

function useOnlineStatus() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function VersionHistory({ documentId, onRestored }: { documentId: string; onRestored: () => void }) {
  const { data: versions } = useDocumentVersions(documentId);
  const restore = useRestoreVersion(documentId);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          History
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {!versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No earlier versions yet.</p>
          ) : (
            versions.map((v) => (
              <div key={v.version} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {parseServerTime(v.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                  {v.content || <em>empty</em>}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={restore.isPending}
                  onClick={async () => {
                    await restore.mutateAsync(v.version);
                    toast.success(`Restored version ${v.version}`);
                    onRestored();
                  }}
                >
                  Restore this version
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const CHECK_LINE = /^(\s*)[-*] \[( |x|X)\] (.*)$/;

/** Clickable view of a checklist document's "- [ ] item" lines (Feature 4). */
function ChecklistView({ content, canEdit, onChange }: { content: string; canEdit: boolean; onChange: (next: string) => void }) {
  const lines = content.split("\n");
  const items = lines
    .map((line, index) => ({ index, match: CHECK_LINE.exec(line) }))
    .filter((x): x is { index: number; match: RegExpExecArray } => !!x.match);
  if (!items.length) return null;
  const done = items.filter((i) => i.match[2].toLowerCase() === "x").length;
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Checklist">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Checklist</h2>
        <span className="text-xs text-muted-foreground">
          {done} of {items.length} done
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="flex flex-col gap-2">
        {items.map(({ index, match }) => {
          const checked = match[2].toLowerCase() === "x";
          const id = `check-${index}`;
          return (
            <li key={index} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={checked}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  const next = [...lines];
                  next[index] = `${match[1]}- [${v === true ? "x" : " "}] ${match[3]}`;
                  onChange(next.join("\n"));
                }}
                className="mt-0.5"
              />
              <label htmlFor={id} className={cn("text-sm leading-snug", checked && "text-muted-foreground line-through")}>
                {match[3]}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function DocumentEditorPage() {
  const params = useParams<{ id: string; docId: string }>();
  const { id: workspaceId, docId } = params;
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: members } = useMembers(workspaceId);
  // Poll so a teammate's edits show up without a reload (Section 4.4).
  const { data: doc, isLoading, refetch } = useDocument(docId, { refetchInterval: 10_000 });
  const patchDoc = usePatchDocument(docId);
  const patchState = usePatchState();
  const online = useOnlineStatus();

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [baseVersion, setBaseVersion] = React.useState(0);
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [conflict, setConflict] = React.useState<DocumentConflict | null>(null);
  const [, forceTick] = React.useState(0);

  const hydrated = React.useRef(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = React.useRef(false);
  // Latest editor values, read by the save timer so it never sends a stale render's text.
  const latest = React.useRef({ title: "", content: "" });
  // What the server has, so we can tell whether there are unsaved local edits.
  const saved = React.useRef({ title: "", content: "" });

  React.useEffect(() => {
    if (!userLoading && !user) router.replace(`/login?next=/files/${workspaceId}/docs/${docId}`);
  }, [user, userLoading, router, workspaceId, docId]);

  React.useEffect(() => {
    if (user) {
      patchState.mutate({
        last_route: `/files/${workspaceId}/docs/${docId}`,
        last_workspace_id: workspaceId,
        last_document_id: docId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, docId]);

  function load(d: { title: string; content: string; version: number }) {
    setTitle(d.title);
    setContent(d.content);
    setBaseVersion(d.version);
    latest.current = { title: d.title, content: d.content };
    saved.current = { title: d.title, content: d.content };
  }

  React.useEffect(() => {
    if (!doc) return;
    if (!hydrated.current) {
      hydrated.current = true;
      load(doc);
      return;
    }
    if (doc.version > baseVersion && status !== "saving") {
      const dirty = latest.current.content !== saved.current.content || latest.current.title !== saved.current.title;
      if (dirty) {
        setConflict({ message: "A teammate updated this document.", current: doc });
      } else {
        load(doc);
        const who = members?.find((m) => m.user_id === doc.updated_by)?.name ?? "A teammate";
        toast.info(`${who} updated this document`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Keep "Saved Xs ago" fresh.
  React.useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const doSave = React.useCallback(
    async (overwrite = false) => {
      if (!online) {
        pendingSave.current = true;
        setStatus("offline");
        return;
      }
      setStatus("saving");
      const snapshot = { ...latest.current };
      try {
        const effectiveBase = overwrite && conflict ? conflict.current.version : baseVersion;
        const result = await patchDoc.mutateAsync({ ...snapshot, base_version: effectiveBase });
        setBaseVersion(result.version);
        saved.current = snapshot;
        setStatus("saved");
        setLastSavedAt(new Date());
        setConflict(null);
        pendingSave.current = false;
      } catch (err) {
        const c = getConflict(err);
        if (c) setConflict(c);
        else pendingSave.current = true; // network/server hiccup: keep the edits and retry
        setStatus("error");
      }
    },
    [online, baseVersion, conflict, patchDoc]
  );

  // The timer always calls the newest doSave (which has the newest baseVersion).
  const doSaveRef = React.useRef(doSave);
  doSaveRef.current = doSave;

  function edit(next: { title?: string; content?: string }) {
    latest.current = { ...latest.current, ...next };
    if (next.title !== undefined) setTitle(next.title);
    if (next.content !== undefined) setContent(next.content);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSaveRef.current(), 1500);
  }

  React.useEffect(() => {
    if (online && pendingSave.current) doSaveRef.current();
  }, [online]);

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Warn before leaving with unsaved edits.
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (latest.current.content !== saved.current.content || latest.current.title !== saved.current.title) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  if (userLoading || !user || isLoading) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  if (!doc) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        This document doesn&apos;t exist, or you don&apos;t have access to it.
      </div>
    );
  }

  const canEdit = workspace ? workspace.my_role === "owner" || workspace.my_role === "editor" : false;
  const editorName = members?.find((m) => m.user_id === doc.updated_by)?.name;

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "offline"
        ? "Offline — changes kept locally"
        : status === "error" && !conflict
          ? "Couldn't save — will retry"
          : lastSavedAt
            ? `Saved ${Math.max(0, Math.round((Date.now() - lastSavedAt.getTime()) / 1000))}s ago`
            : "";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/files/${workspaceId}?tab=documents`} className="text-sm text-muted-foreground hover:underline">
          &larr; {workspace ? `${workspace.icon} ${workspace.name}` : "Back to file"}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {statusLabel}
          </span>
          <VersionHistory
            documentId={docId}
            onRestored={() => {
              hydrated.current = false;
              refetch();
            }}
          />
        </div>
      </div>

      {conflict && (
        <Alert variant="destructive">
          <AlertTitle>A teammate updated this document</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>Their version is newer than the one you&apos;re editing.</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  load(conflict.current);
                  setConflict(null);
                  setStatus("idle");
                  toast.info("Loaded their version");
                }}
              >
                View their version
              </Button>
              <Button size="sm" variant="destructive" onClick={() => doSave(true)}>
                Overwrite with mine
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Input
        value={title}
        disabled={!canEdit}
        onChange={(e) => edit({ title: e.target.value })}
        aria-label="Document title"
        className="text-lg font-semibold"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Badge variant="outline" className="capitalize">
          {doc.type.replace("_", " ")}
        </Badge>
        <span>
          Last edited{editorName ? ` by ${editorName}` : ""}, {timeAgo(doc.updated_at)} · v{doc.version}
        </span>
        {doc.opportunity_id && (
          <Link href={`/opportunities/${doc.opportunity_id}`} className="underline underline-offset-2 hover:text-foreground">
            Linked opportunity
          </Link>
        )}
      </div>

      {doc.type === "checklist" && (
        <ChecklistView content={content} canEdit={canEdit} onChange={(next) => edit({ content: next })} />
      )}

      <Textarea
        value={content}
        disabled={!canEdit}
        onChange={(e) => edit({ content: e.target.value })}
        rows={20}
        aria-label="Document content (Markdown)"
        className="min-h-[28rem] font-mono text-sm"
        placeholder={canEdit ? "Write in Markdown…" : "You have view-only access to this document."}
      />
    </div>
  );
}
