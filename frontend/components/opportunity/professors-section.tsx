"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KitDialog } from "@/components/opportunity/actions";
import { ProfessorCard, ProfessorSkeleton, SourceNote, toProfessorRef } from "@/components/professors/professor-list";
import { useProfessors } from "@/lib/actions";
import type { Opportunity, ProfessorRef } from "@/lib/types";

const ONLY_EMAIL: "cold_email"[] = ["cold_email"];

export function ProfessorsSection({ opp }: { opp: Opportunity }) {
  const { data, isLoading, isError } = useProfessors({ opportunityId: opp.id });
  const [emailTo, setEmailTo] = React.useState<ProfessorRef | null>(null);
  return (
    <Card id="researchers" className="scroll-mt-[calc(var(--header-h,3.5rem)+1rem)]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Users className="size-4" aria-hidden /> Researchers to contact
          </span>
          <Link href="/professors" className="text-xs font-normal text-muted-foreground hover:text-foreground">
            Search all researchers
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <>
            <p className="text-xs text-muted-foreground">Searching Semantic Scholar for recent papers in this area&hellip;</p>
            <ProfessorSkeleton />
          </>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load researchers right now.</p>
        ) : (
          <>
            <SourceNote result={data} />
            <div className="grid gap-3 xl:grid-cols-2">
              {data.authors.slice(0, 4).map((p) => (
                <ProfessorCard key={p.author_id} p={p} opportunityId={opp.id} onDraftEmail={(prof) => setEmailTo(toProfessorRef(prof))} />
              ))}
            </div>
          </>
        )}
      </CardContent>
      <KitDialog
        opp={opp}
        open={!!emailTo}
        onOpenChange={(o) => !o && setEmailTo(null)}
        professor={emailTo}
        only={ONLY_EMAIL}
      />
    </Card>
  );
}
