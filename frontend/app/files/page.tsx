"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useCreateWorkspace, useWorkspaces } from "@/lib/workspaces";
import { ApiError } from "@/lib/api";
import type { WorkspaceTemplate } from "@/lib/types";

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

export default function FilesPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: workspaces, isLoading } = useWorkspaces();
  useTrackRoute("/files");

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
          <h1 className="text-2xl font-semibold">Application Files</h1>
          <p className="text-sm text-muted-foreground">Workspaces for your applications, solo or with teammates.</p>
        </div>
        <NewFileDialog />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading&hellip;</div>
      ) : !workspaces || workspaces.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No Application Files yet. Create one to start tracking an application.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link key={ws.id} href={`/files/${ws.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{ws.icon}</span>
                    <CardTitle className="text-base">{ws.name}</CardTitle>
                    {ws.archived && <Badge variant="outline">archived</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {ws.member_count} member{ws.member_count !== 1 ? "s" : ""} &middot; {ws.document_count} doc
                    {ws.document_count !== 1 ? "s" : ""}
                  </span>
                  <Badge variant="secondary">{ws.my_role}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
