"use client";

import * as React from "react";
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
import { useWorkspace } from "@/lib/workspaces";
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
                    {new Date(v.created_at).toLocaleString()}
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

export default function DocumentEditorPage() {
  const params = useParams<{ id: string; docId: string }>();
  const { id: workspaceId, docId } = params;
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: doc, isLoading, refetch } = useDocument(docId);
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

  React.useEffect(() => {
    if (!userLoading && !user) router.replace(`/login?next=/files/${workspaceId}/docs/${docId}`);
  }, [user, userLoading, router, workspaceId, docId]);

  React.useEffect(() => {
    if (user) {
      patchState.mutate({ last_route: `/files/${workspaceId}/docs/${docId}`, last_document_id: docId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, docId]);

  React.useEffect(() => {
    if (doc && !hydrated.current) {
      hydrated.current = true;
      setTitle(doc.title);
      setContent(doc.content);
      setBaseVersion(doc.version);
    }
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
      try {
        const effectiveBase = overwrite && conflict ? conflict.current.version : baseVersion;
        const saved = await patchDoc.mutateAsync({ title, content, base_version: effectiveBase });
        setBaseVersion(saved.version);
        setStatus("saved");
        setLastSavedAt(new Date());
        setConflict(null);
        pendingSave.current = false;
      } catch (err) {
        const c = getConflict(err);
        if (c) {
          setConflict(c);
          setStatus("error");
        } else {
          setStatus("error");
        }
      }
    },
    [online, baseVersion, conflict, title, content, patchDoc]
  );

  function scheduleAutosave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 1500);
  }

  React.useEffect(() => {
    if (online && pendingSave.current) {
      doSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
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

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "offline"
      ? "Offline — changes kept locally"
      : status === "error" && !conflict
      ? "Couldn't save — retrying next edit"
      : lastSavedAt
      ? `Saved ${Math.max(0, Math.round((Date.now() - lastSavedAt.getTime()) / 1000))}s ago`
      : "";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href={`/files/${workspaceId}`} className="text-sm text-muted-foreground hover:underline">
          &larr; Back to file
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
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
                  setTitle(conflict.current.title);
                  setContent(conflict.current.content);
                  setBaseVersion(conflict.current.version);
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
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleAutosave();
        }}
        className="text-lg font-semibold"
      />
      <Badge variant="outline" className="w-fit capitalize">
        {doc.type.replace("_", " ")}
      </Badge>

      <Textarea
        value={content}
        disabled={!canEdit}
        onChange={(e) => {
          setContent(e.target.value);
          scheduleAutosave();
        }}
        rows={20}
        className="min-h-[28rem] font-mono text-sm"
        placeholder={canEdit ? "Write in Markdown…" : "You have view-only access to this document."}
      />
    </div>
  );
}
