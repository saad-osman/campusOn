"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterChips, FilterCount, FilterHeader, FilterSections, filterChips } from "@/components/discover/filters";
import { OpportunityCard, OpportunityCardSkeleton } from "@/components/opportunity/opportunity-card";
import { useRequireUser } from "@/lib/auth";
import { EMPTY_FILTERS, useSearch, type SearchArgs } from "@/lib/opportunities";
import { profileEditHref, useProfile } from "@/lib/profile";
import { usePatchState, useTrackRoute, useUserState } from "@/lib/state";
import type { SearchFilters } from "@/lib/types";

const EXAMPLES = [
  "funded summer AI internships in Europe for 3rd year undergrads",
  "fully funded PhD positions in the UAE",
  "public policy scholarships closing this month",
  "robotics research internships in the GCC",
];

type Sort = "match" | "deadline" | "newest";
type SavedDiscover = { q?: string; filters?: SearchFilters; sort?: Sort };

export default function DiscoverPage() {
  return (
    <React.Suspense fallback={null}>
      <Discover />
    </React.Suspense>
  );
}

function Discover() {
  const searchParams = useSearchParams();
  const { data: user } = useRequireUser("/discover");
  const { data: profile } = useProfile();
  const { data: state, isFetched: stateFetched } = useUserState();
  const patchState = usePatchState();
  useTrackRoute("/discover");

  const [input, setInput] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("match");
  const [args, setArgs] = React.useState<SearchArgs | null>(null);
  // Set once the user types, so a late-arriving saved search never overwrites their input.
  const touched = React.useRef(false);

  // Restore the last search exactly as it was left (Section 4.2).
  React.useEffect(() => {
    if (args !== null || !stateFetched) return;
    const fromUrl = searchParams.get("q");
    if (fromUrl) {
      setInput(fromUrl);
      setArgs({ q: fromUrl, sort: "match" });
      return;
    }
    const saved = (state?.ui_state?.discover ?? {}) as SavedDiscover;
    if (touched.current) {
      setArgs({ filters: EMPTY_FILTERS, sort: "match" });
      return;
    }
    setInput(saved.q ?? "");
    setSort(saved.sort ?? "match");
    setArgs({ filters: { ...EMPTY_FILTERS, ...(saved.filters ?? {}) }, sort: saved.sort ?? "match" });
  }, [stateFetched, state, args, searchParams]);

  const { data, isLoading, isFetching, isError, isPlaceholderData } = useSearch(args);
  // Replays the results entrance only for a genuinely new result set: the key comes from
  // settled data, so placeholder data, a background refetch or a save toggle (same ids)
  // keeps the last key and nothing re-animates.
  const settledKey = React.useRef("");
  if (data && !isPlaceholderData) settledKey.current = JSON.stringify([args, data.results.map((r) => r.id)]);
  const resultsKey = settledKey.current;
  const filters = data?.filters ?? args?.filters ?? EMPTY_FILTERS;

  // Persist query + interpreted filters, debounced (server also caps at ~1 write / 2.5 s).
  React.useEffect(() => {
    if (!data || !user) return;
    const t = setTimeout(() => {
      patchState.mutate({ ui_state: { discover: { q: input, filters: data.filters, sort } } });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.filters, sort, user]);

  function runQuery(q: string) {
    setInput(q);
    setArgs(q.trim() ? { q, sort } : { filters: EMPTY_FILTERS, sort });
  }

  function applyFilters(next: SearchFilters) {
    setArgs({ filters: next, sort });
  }

  function clearAll() {
    setInput("");
    applyFilters(EMPTY_FILTERS);
  }

  function changeSort(next: Sort) {
    setSort(next);
    setArgs({ filters, sort: next });
  }

  const hasProfile = !!profile && (profile.onboarding_complete || !!profile.degree_level);
  const activeCount = filterChips(filters).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Discover</h1>
          <p className="text-sm text-muted-foreground">
            Search the way you&apos;d ask a senior. We turn it into filters you can see and correct.
          </p>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            runQuery(input);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => {
                touched.current = true;
                setInput(e.target.value);
              }}
              placeholder="e.g. funded summer AI internships in Europe for 3rd year undergrads"
              aria-label="Search opportunities"
              className="h-11 pl-9 text-base"
            />
          </div>
          <Button type="submit" size="lg" className="h-11 px-4">
            Search
          </Button>
        </form>
        {!input && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => runQuery(ex)}
                className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-4" aria-hidden />
              {data?.parsed_by ? "Understood as" : "Filters"}:
            </span>
            <FilterChips filters={filters} onChange={applyFilters} />
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
        )}
      </header>

      {!hasProfile && profile && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <strong>Get eligibility verdicts and match scores.</strong> Finish your profile (or upload your CV) and every
          result will tell you whether you qualify and why.{" "}
          <Link href={profileEditHref(profile)} className="font-medium underline underline-offset-2">
            Set up profile
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Desktop: its own surface, pinned below the nav, scrolling independently of the results. */}
        <aside
          aria-label="Filters"
          className="sticky top-[calc(var(--header-h,57px)+1rem)] hidden h-[calc(100vh-var(--header-h,57px)-2rem)] flex-col self-start overflow-hidden rounded-xl border bg-sidebar text-sidebar-foreground lg:flex"
        >
          <FilterHeader count={activeCount} onClear={clearAll} className="shrink-0" />
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <FilterSections filters={filters} onChange={applyFilters} />
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-4" aria-live="polite" aria-busy={isFetching}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {data ? `${data.total} opportunit${data.total === 1 ? "y" : "ies"}` : "Searching…"}
              {isFetching && data ? " · updating…" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal /> Filters
                    <FilterCount count={activeCount} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" aria-describedby={undefined} className="gap-0 bg-sidebar p-0 text-sidebar-foreground">
                  <FilterHeader
                    count={activeCount}
                    title={<SheetTitle className="font-heading text-lg font-semibold tracking-tight">Filters</SheetTitle>}
                    className="shrink-0 pr-12"
                  />
                  <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                    <FilterSections filters={filters} onChange={applyFilters} />
                  </div>
                  <SheetFooter className="mt-0 shrink-0 flex-row gap-2 border-t px-5 py-4">
                    <Button variant="outline" onClick={clearAll} disabled={!activeCount}>
                      Clear all
                    </Button>
                    <SheetClose asChild>
                      <Button className="flex-1">
                        {data ? `Show ${data.total} result${data.total === 1 ? "" : "s"}` : "Show results"}
                      </Button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
              <Select value={sort} onValueChange={(v: string) => changeSort(v as Sort)}>
                <SelectTrigger size="sm" aria-label="Sort results" className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="match">Best match</SelectItem>
                  <SelectItem value="deadline">Deadline soonest</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isError ? (
            <div className="rounded-lg border border-destructive/40 p-6 text-sm">
              Search failed. Check that the backend is running, then try again.
            </div>
          ) : isLoading || !data ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <OpportunityCardSkeleton key={i} />
              ))}
            </div>
          ) : data.results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
              <p className="font-medium">Nothing matches all of those filters.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Remove a chip above to widen the search. Funding, region and year together narrow things fast.
              </p>
              <Button variant="outline" onClick={() => applyFilters(EMPTY_FILTERS)}>
                Show everything
              </Button>
            </div>
          ) : (
            <div key={resultsKey} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.results.map((opp, i) => (
                <OpportunityCard key={opp.id} opp={opp} enterIndex={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
