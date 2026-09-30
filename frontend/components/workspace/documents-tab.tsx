"use client";

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
  const create = useCreateDocument(workspaceId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ title, type });
    setOpen(false);
    setTitle("");
    setType("notes");
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
              <Label>Title</Label>
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
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
                      v{doc.version} &middot; updated {new Date(doc.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline">{DOC_TYPE_LABELS[doc.type]}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
