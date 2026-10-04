"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Columns3, FolderPlus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { useAddToTracker, useGenerateKit, useProfessors } from "@/lib/actions";
import { MAX_COMPARE, useCompare } from "@/lib/compare";
import { cn } from "@/lib/utils";
import { useWorkspaces } from "@/lib/workspaces";
import type { Opportunity, ProfessorRef } from "@/lib/types";

const NEW_FILE = "__new__";

/** Application Files the user can write to, for "pick a file" selects. */
export function useEditableFiles() {
  const { data, isLoading } = useWorkspaces();
  return { files: (data ?? []).filter((w) => !w.archived && w.my_role !== "viewer"), isLoading };
}

export function FileSelect({ value, onChange, allowNew = true }: { value: string; onChange: (v: string) => void; allowNew?: boolean }) {
  const { files } = useEditableFiles();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label="Application File">
        <SelectValue placeholder="Choose an Application File" />
      </SelectTrigger>
      <SelectContent>
        {allowNew && <SelectItem value={NEW_FILE}>+ New Application File</SelectItem>}
        {files.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddToFileDialog({ opp, open, onOpenChange }: { opp: Opportunity; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { files } = useEditableFiles();
  const [fileId, setFileId] = React.useState("");
  const add = useAddToTracker();
  React.useEffect(() => {
    if (open && !fileId && files[0]) setFileId(files[0].id);
  }, [open, files, fileId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to an Application File</DialogTitle>
          <DialogDescription>It goes into the file&apos;s tracker, where teammates can see it and you can assign it.</DialogDescription>
        </DialogHeader>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have an Application File yet. <Link href="/files" className="underline">Create one</Link>, or use
            &ldquo;Generate application kit&rdquo;, which makes one for you.
          </p>
        ) : (
          <FileSelect value={fileId} onChange={setFileId} allowNew={false} />
        )}
        <DialogFooter>
          <Button
            disabled={!fileId || add.isPending}
            onClick={async () => {
              try {
                await add.mutateAsync({ workspaceId: fileId, opportunityId: opp.id });
                toast.success("Added to tracker", {
                  action: { label: "Open file", onClick: () => window.location.assign(`/files/${fileId}?tab=tracker`) },
                });
                onOpenChange(false);
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Couldn't add it");
              }
            }}
          >
            Add to tracker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type KitPart = "checklist" | "sop" | "cold_email";

export function KitDialog({
  opp,
  open,
  onOpenChange,
  professor,
  only,
}: {
  opp: Opportunity;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  professor?: ProfessorRef | null;
  only?: KitPart[];
}) {
  const router = useRouter();
  const generate = useGenerateKit();
  const { files } = useEditableFiles();
  const [fileId, setFileId] = React.useState(NEW_FILE);
  const [parts, setParts] = React.useState<KitPart[]>(only ?? ["checklist", "sop", "cold_email"]);
  const { data: profs } = useProfessors(open && !professor ? { opportunityId: opp.id } : null);
  const [profIndex, setProfIndex] = React.useState("0");

  const onlyKey = only?.join(",");
  React.useEffect(() => {
    if (open) setParts(onlyKey ? (onlyKey.split(",") as KitPart[]) : ["checklist", "sop", "cold_email"]);
  }, [open, onlyKey]);

  const candidates = profs?.authors.slice(0, 5) ?? [];
  const chosenProf: ProfessorRef | undefined = professor ?? (candidates.length && profIndex !== "none"
    ? (() => {
        const a = candidates[Number(profIndex)] ?? candidates[0];
        const paper = a.recent_papers[0];
        return { name: a.name ?? "Professor", affiliation: a.affiliations[0], paper_title: paper?.title, paper_year: paper?.year };
      })()
    : undefined);

  const toggle = (p: KitPart) => setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{only?.length === 1 && only[0] === "cold_email" ? "Draft a cold email" : "Generate application kit"}</DialogTitle>
          <DialogDescription>
            Drafts are written from your profile and CV only (nothing invented), saved into an Application File and labelled
            &ldquo;AI draft &mdash; edit before sending&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Save into</Label>
            <FileSelect value={fileId} onChange={setFileId} />
            {fileId === NEW_FILE && <p className="text-xs text-muted-foreground">A new file named after this opportunity.</p>}
          </div>
          {!only && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Include</legend>
              {([["checklist", "Document checklist"], ["sop", "Statement of Purpose draft"], ["cold_email", "Cold email to a professor"]] as const).map(([id, label]) => (
                <div key={id} className="flex items-center gap-2">
                  <Checkbox id={`kit-${id}`} checked={parts.includes(id)} onCheckedChange={() => toggle(id)} />
                  <Label htmlFor={`kit-${id}`} className="font-normal">{label}</Label>
                </div>
              ))}
            </fieldset>
          )}
          {parts.includes("cold_email") && (
            <div className="flex flex-col gap-1.5">
              <Label>Professor to email</Label>
              {professor ? (
                <p className="text-sm">{professor.name}{professor.paper_title ? `, re “${professor.paper_title}”` : ""}</p>
              ) : !profs ? (
                <p className="text-xs text-muted-foreground">Finding matching researchers&hellip;</p>
              ) : (
                <Select value={profIndex} onValueChange={setProfIndex}>
                  <SelectTrigger className="w-full" aria-label="Professor"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((a, i) => (
                      <SelectItem key={a.author_id} value={String(i)}>
                        {a.name}{a.highlight ? ` · ${a.highlight}` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="none">Leave a placeholder</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {files.length === 0 && fileId !== NEW_FILE && <p className="text-xs text-destructive">Choose a file.</p>}
        </div>
        <DialogFooter>
          <Button
            disabled={!parts.length || generate.isPending}
            onClick={async () => {
              try {
                const kit = await generate.mutateAsync({
                  opportunity_id: opp.id,
                  workspace_id: fileId === NEW_FILE ? undefined : fileId,
                  include: parts,
                  professor: parts.includes("cold_email") ? chosenProf : undefined,
                });
                toast.success(`${kit.documents.length} draft${kit.documents.length === 1 ? "" : "s"} saved to ${kit.workspace_name}`);
                onOpenChange(false);
                router.push(kit.documents.length === 1 ? `/files/${kit.workspace_id}/docs/${kit.documents[0].id}` : `/files/${kit.workspace_id}?tab=documents`);
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Generation failed");
              }
            }}
          >
            <Wand2 /> {generate.isPending ? "Writing drafts…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The only place users add to /compare (not Discover cards, the dashboard or professors). */
function CompareButton({ opp }: { opp: Opportunity }) {
  const router = useRouter();
  const compare = useCompare();
  const inCompare = compare.has(opp.id);
  const view = { label: "View", onClick: () => router.push("/compare") };
  return (
    <Button
      variant="outline"
      aria-pressed={inCompare}
      disabled={!compare.ready}
      className={cn(inCompare && "border-honor/30 bg-accent text-honor hover:bg-accent hover:text-honor dark:border-honor/30 dark:bg-accent dark:hover:bg-accent")}
      onClick={() => {
        if (inCompare) {
          compare.remove(opp.id);
          return;
        }
        const result = compare.add(opp.id);
        if (result === "added") {
          toast.success(`Added to compare · ${compare.ids.length + 1} of ${MAX_COMPARE}`, { action: view });
        } else if (result === "full") {
          toast.error(`You can compare up to ${MAX_COMPARE} at once. Remove one first.`, { action: view });
        }
      }}
    >
      {inCompare ? <Check /> : <Columns3 />} {inCompare ? "In compare" : "Add to compare"}
    </Button>
  );
}

export function OpportunityActions({ opp }: { opp: Opportunity }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [kitOpen, setKitOpen] = React.useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setKitOpen(true)}>
        <Wand2 /> Generate application kit
      </Button>
      <Button variant="outline" onClick={() => setAddOpen(true)}>
        <FolderPlus /> Add to file
      </Button>
      {opp.deadline && (
        <Button variant="outline" asChild>
          <a href={`/api/opportunities/${opp.id}/calendar.ics`} download>
            <CalendarPlus /> Export to calendar
          </a>
        </Button>
      )}
      <CompareButton opp={opp} />
      <AddToFileDialog opp={opp} open={addOpen} onOpenChange={setAddOpen} />
      <KitDialog opp={opp} open={kitOpen} onOpenChange={setKitOpen} />
    </div>
  );
}
