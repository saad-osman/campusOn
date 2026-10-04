"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSelect, useEditableFiles } from "@/components/opportunity/actions";
import { ProfessorCard, ProfessorSkeleton, SourceNote, toProfessorRef } from "@/components/professors/professor-list";
import { OutreachList } from "@/components/professors/outreach";
import { ApiError } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { useGenerateDraft, useProfessors } from "@/lib/actions";
import { useSavedOpportunities } from "@/lib/opportunities";
import { profileEditHref, useProfile } from "@/lib/profile";
import { useTrackRoute } from "@/lib/state";
import type { Professor } from "@/lib/types";

function DraftEmailDialog({ professor, onClose }: { professor: Professor | null; onClose: () => void }) {
  const router = useRouter();
  const { files } = useEditableFiles();
  const { data: saved } = useSavedOpportunities();
  const draft = useGenerateDraft();
  const [fileId, setFileId] = React.useState("");
  const [oppId, setOppId] = React.useState("none");
  React.useEffect(() => {
    if (professor && !fileId && files[0]) setFileId(files[0].id);
  }, [professor, files, fileId]);
  return (
    <Dialog open={!!professor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Draft a cold email to {professor?.name}</DialogTitle>
          <DialogDescription>
            Under 150 words, referencing &ldquo;{professor?.recent_papers[0]?.title}&rdquo;. Written from your profile only, and
            saved as an AI draft for you to edit.
          </DialogDescription>
        </DialogHeader>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Drafts are saved into an Application File. <Link href="/files" className="underline">Create one first</Link>.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Save into</Label>
              <FileSelect value={fileId} onChange={setFileId} allowNew={false} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>About an opportunity (optional)</Label>
              <Select value={oppId} onValueChange={setOppId}>
                <SelectTrigger className="w-full" aria-label="Opportunity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General research enquiry</SelectItem>
                  {(saved ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!fileId || draft.isPending || !professor}
            onClick={async () => {
              try {
                const doc = await draft.mutateAsync({
                  workspace_id: fileId,
                  type: "cold_email",
                  opportunity_id: oppId === "none" ? undefined : oppId,
                  professor: toProfessorRef(professor!),
                });
                toast.success("Draft saved");
                onClose();
                router.push(`/files/${fileId}/docs/${doc.id}`);
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Couldn't write the draft");
              }
            }}
          >
            {draft.isPending ? "Writing…" : "Write draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfessorsPage() {
  useRequireUser("/professors");
  useTrackRoute("/professors");
  const { data: profile } = useProfile();
  const [input, setInput] = React.useState("");
  const [query, setQuery] = React.useState<string | null>(null);
  const [emailTo, setEmailTo] = React.useState<Professor | null>(null);

  // Start from the student's own interests.
  React.useEffect(() => {
    if (query === null && profile) {
      const q = (profile.interests ?? []).slice(0, 2).join(" ");
      setInput(q);
      setQuery(q);
    }
  }, [profile, query]);

  const { data, isLoading, isError, isFetching } = useProfessors(query ? { q: query } : null);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Professor &amp; lab finder</h1>
          <p className="text-sm text-muted-foreground">
            Find researchers publishing in your area right now, then draft a specific, short cold email.
          </p>
        </div>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) setQuery(input.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="A research interest, e.g. multilingual NLP, drone navigation, energy policy"
              aria-label="Research interest"
              className="h-11 pl-9 text-base"
            />
          </div>
          <Button type="submit" size="lg" className="h-11 px-4">Find researchers</Button>
        </form>
      </header>

      <OutreachList />

      {query === "" && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Type a research interest to start, or <Link href={profileEditHref(profile)} className="underline">add interests to your profile</Link> and
          we&apos;ll search for them automatically.
        </div>
      )}
      {query && (isLoading || (isFetching && !data)) ? (
        <div className="flex flex-col gap-3" aria-busy>
          <p className="text-sm text-muted-foreground">Searching recent papers. The public API can take a few seconds&hellip;</p>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <ProfessorSkeleton key={i} />)}
          </div>
        </div>
      ) : isError ? (
        <p className="rounded-xl border border-destructive/40 p-6 text-sm">The search failed. Try a different phrase.</p>
      ) : data ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <SourceNote result={data} />
          {data.authors.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No recent papers found for that. Try broader terms.
            </p>
          ) : (
            // Keyed on the settled result set: a new search replays the entrance, a background
            // refetch returning the same researchers does not.
            <div key={JSON.stringify([query, data.authors.map((a) => a.author_id)])} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.authors.map((p, i) => (
                <ProfessorCard key={p.author_id} p={p} onDraftEmail={setEmailTo} enterIndex={i} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <DraftEmailDialog professor={emailTo} onClose={() => setEmailTo(null)} />
    </div>
  );
}
