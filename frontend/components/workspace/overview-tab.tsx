"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ReadinessMeter } from "@/components/workspace/readiness";
import { useDeleteWorkspace, useDuplicateWorkspace, usePatchWorkspace } from "@/lib/workspaces";
import type { Workspace } from "@/lib/types";

export function OverviewTab({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const isOwner = workspace.my_role === "owner";
  const patch = usePatchWorkspace(workspace.id);
  const duplicate = useDuplicateWorkspace();
  const del = useDeleteWorkspace();

  const [name, setName] = React.useState(workspace.name);
  const [description, setDescription] = React.useState(workspace.description ?? "");

  async function saveDetails() {
    await patch.mutateAsync({ name, description: description || undefined });
    toast.success("Saved");
  }

  async function onDuplicate() {
    const copy = await duplicate.mutateAsync(workspace.id);
    toast.success("Duplicated");
    router.push(`/files/${copy.id}`);
  }

  async function onArchiveToggle() {
    await patch.mutateAsync({ archived: !workspace.archived });
    toast.success(workspace.archived ? "Unarchived" : "Archived");
  }

  async function onDelete() {
    await del.mutateAsync(workspace.id);
    toast.success("Deleted");
    router.push("/files");
  }

  return (
    <div className="flex flex-col gap-4">
      {workspace.readiness && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <ReadinessMeter readiness={workspace.readiness} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={!isOwner}
            />
          </div>
          {isOwner && (
            <Button onClick={saveDetails} disabled={patch.isPending} className="self-start">
              {patch.isPending ? "Saving…" : "Save changes"}
            </Button>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Owner actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onDuplicate} disabled={duplicate.isPending}>
              Duplicate
            </Button>
            <Button variant="outline" onClick={onArchiveToggle} disabled={patch.isPending}>
              {workspace.archived ? "Unarchive" : "Archive"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this Application File?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes all documents, tracker items, and activity for every
                    member. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} disabled={del.isPending}>
                    {del.isPending ? "Deleting…" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
