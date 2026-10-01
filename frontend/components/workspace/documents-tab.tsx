"use client";

import { parseServerTime } from "@/lib/format";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/lib/api";
import { useGenerateDraft, useTracker } from "@/lib/actions";
import { useCreateDocument, useDocuments } from "@/lib/workspaces";
import type { DocumentType } from "@/lib/types";

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  sop: "Statement of Purpose",
  cold_email: "Cold Email",
  checklist: "Checklist",
  notes: "Notes",
  cover_letter: "Cover Letter",
};

function NewDocumentDialog({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<DocumentType>("notes");
  const [oppId, setOppId] = React.useState("none");
  const [useAI, setUseAI] = React.useState(false);
  const create = useCreateDocument(workspaceId);
  const draft = useGenerateDraft();
  const { data: tracker } = useTracker(open ? workspaceId : undefined);
  const router = useRouter();
  const linkable = (tracker ?? []).filter((t) => t.opportunity);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const opportunity_id = oppId === "none" ? undefined : oppId;
    try {
      const doc = useAI
        ? await draft.mutateAsync({ workspace_id: workspaceId, type, title: title || undefined, opportunity_id })
        : await create.mutateAsync({ title, type, opportunity_id });
      toast.success(useAI ? "AI draft created" : "Document created");
      setOpen(false);
      setTitle("");
      setType("notes");
      setOppId("none");
      setUseAI(false);
      router.push(`/files/${workspaceId}/docs/${doc.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the document");
    }
  }

  if (!canEdit) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ New Document</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: string) => setType(v as DocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                required={!useAI}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={useAI ? "Optional: we'll name it for you" : undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Linked opportunity</Label>
              <Select value={oppId} onValueChange={setOppId}>
                <SelectTrigger aria-label="Linked opportunity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {linkable.map((t) => (
                    <SelectItem key={t.opportunity!.id} value={t.opportunity!.id}>
                      {t.opportunity!.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkable.length === 0 && (
                <p className="text-xs text-muted-foreground">Add opportunities to this file&apos;s tracker to link them.</p>
              )}
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="doc-ai" checked={useAI} onCheckedChange={(v) => setUseAI(v === true)} />
              <Label htmlFor="doc-ai" className="font-normal leading-snug">
                Generate a first draft with AI, written from your profile (no invented details) and labelled as an AI
                draft
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || draft.isPending}>
              {draft.isPending ? "Writing draft…" : create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsTab({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const { data: documents, isLoading } = useDocuments(workspaceId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <NewDocumentDialog workspaceId={workspaceId} canEdit={canEdit} />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading&hellip;</p>
      ) : !documents || documents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No documents yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/files/${workspaceId}/docs/${doc.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      v{doc.version} &middot; updated {parseServerTime(doc.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {doc.content.startsWith("> **AI draft") && <Badge variant="secondary">AI draft</Badge>}
                    <Badge variant="outline">{DOC_TYPE_LABELS[doc.type]}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
