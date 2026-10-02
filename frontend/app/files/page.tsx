"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
