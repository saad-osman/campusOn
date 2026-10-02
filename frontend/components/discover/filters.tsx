"use client";

import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { Collapsible } from "radix-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEGREE_LABELS, FIELD_OPTIONS, REGION_LABELS, TYPE_LABELS } from "@/lib/format";
import type { OpportunityType, Region, SearchFilters } from "@/lib/types";

type Chip = { key: string; label: string; remove: (f: SearchFilters) => SearchFilters };

/** Every active filter as a removable chip: what the search understood (Feature 8). */
export function filterChips(f: SearchFilters): Chip[] {
  const chips: Chip[] = [];
  if (f.semantic_query)
    chips.push({ key: "q", label: `“${f.semantic_query}”`, remove: (x) => ({ ...x, semantic_query: null }) });
  if (f.degree_level)
    chips.push({ key: "degree", label: DEGREE_LABELS[f.degree_level], remove: (x) => ({ ...x, degree_level: null }) });
  if (f.year) chips.push({ key: "year", label: `Year ${f.year}`, remove: (x) => ({ ...x, year: null }) });
  for (const field of f.fields)
    chips.push({ key: `field-${field}`, label: field, remove: (x) => ({ ...x, fields: x.fields.filter((v) => v !== field) }) });
  for (const t of f.types)
    chips.push({ key: `type-${t}`, label: TYPE_LABELS[t], remove: (x) => ({ ...x, types: x.types.filter((v) => v !== t) }) });
  for (const r of f.regions)
    chips.push({ key: `region-${r}`, label: REGION_LABELS[r], remove: (x) => ({ ...x, regions: x.regions.filter((v) => v !== r) }) });
  if (f.funding !== "any")
    chips.push({
      key: "funding",
      label: f.funding === "fully_funded" ? "Fully funded" : "Funded",
      remove: (x) => ({ ...x, funding: "any" }),
    });
  if (f.deadline_within_days)
    chips.push({
      key: "deadline",
      label: `Closes within ${f.deadline_within_days} days`,
      remove: (x) => ({ ...x, deadline_within_days: null }),
    });
  if (f.remote_only) chips.push({ key: "remote", label: "Remote", remove: (x) => ({ ...x, remote_only: false }) });
  if (f.open_to_uae_residents)
    chips.push({ key: "uae", label: "Open to UAE residents", remove: (x) => ({ ...x, open_to_uae_residents: null }) });
  if (f.eligible_only)
    chips.push({ key: "eligible", label: "I'm eligible", remove: (x) => ({ ...x, eligible_only: false }) });
  if (f.verified_only)
    chips.push({ key: "verified", label: "Verified only", remove: (x) => ({ ...x, verified_only: false }) });
  if (f.include_expired)
    chips.push({ key: "expired", label: "Including expired", remove: (x) => ({ ...x, include_expired: false }) });
  return chips;
}

export function FilterChips({ filters, onChange }: { filters: SearchFilters; onChange: (f: SearchFilters) => void }) {
  const chips = filterChips(filters);
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onChange(chip.remove(filters))}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {chip.label}
            <X className="size-4" aria-hidden />
            <span className="sr-only">Remove filter</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";
const VISIBLE_OPTIONS = 6;

/** Gold count of active filters. */
export function FilterCount({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/20 px-1.5 text-xs font-semibold tabular-nums text-honor ring-1 ring-inset ring-gold/40",
        className
      )}
    >
      {count}
      <span className="sr-only"> active</span>
    </span>
  );
}

/** Pinned header of the filter panel: title, active count and (optionally) Clear all. */
export function FilterHeader({
  count,
  onClear,
  title,
  className,
}: {
  count: number;
  onClear?: () => void;
  /** Defaults to a plain heading; the Sheet passes its own SheetTitle. */
  title?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b px-5 py-4", className)}>
      <div className="flex items-center gap-2">
        {title ?? <h2 className="font-heading text-lg font-semibold tracking-tight">Filters</h2>}
        <FilterCount count={count} />
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={!count}
          className="rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function CheckRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

function ToggleRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        // Off: a visible track on the panel surface and a soft thumb instead of a bright white one.
        className="data-unchecked:bg-input dark:data-unchecked:bg-input"
        thumbClassName="bg-muted-foreground data-checked:bg-primary-foreground dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-muted-foreground"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {children}
    </div>
  );
}

/** A collapsible checkbox group, open by default; long lists show 6 options plus "Show more". */
function CheckGroup<T extends string>({
  id,
  title,
  options,
  selected,
  label,
  onToggle,
}: {
  id: string;
  title: string;
  options: readonly T[];
  selected: T[];
  label: (o: T) => string;
  onToggle: (o: T) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);
  const hidden = options.length - VISIBLE_OPTIONS;
  // Selected options always stay visible, even when the list is shortened.
  const visible = expanded ? options : options.filter((o, i) => i < VISIBLE_OPTIONS || selected.includes(o));
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="px-5 py-4">
      <Collapsible.Trigger className="group flex w-full items-center justify-between gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span id={`${id}-label`} className={cn(LABEL, "flex items-center gap-2")}>
          {title}
          {!open && selected.length > 0 && (
            <span className="normal-case tracking-normal text-honor">{selected.length} selected</span>
          )}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
      </Collapsible.Trigger>
      <Collapsible.Content role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2.5 pt-3">
        {visible.map((o) => (
          <CheckRow key={o} id={`f-${id}-${o}`} label={label(o)} checked={selected.includes(o)} onChange={() => onToggle(o)} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="w-fit rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? "Show less" : `Show ${hidden} more`}
          </button>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

const TYPES = Object.keys(TYPE_LABELS) as OpportunityType[];
const REGIONS: Region[] = ["uae", "gcc", "europe", "usa", "asia", "india"];

/** The filter controls, grouped into sections. Used by both the desktop sidebar and the mobile Sheet. */
export function FilterSections({ filters, onChange }: { filters: SearchFilters; onChange: (f: SearchFilters) => void }) {
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-col divide-y">
      <div className="flex flex-col gap-3 px-5 py-4">
        <span className={LABEL}>Quick filters</span>
        <ToggleRow id="f-eligible" label="Only ones I can apply to" checked={filters.eligible_only} onChange={(v) => set({ eligible_only: v })} />
        <ToggleRow
          id="f-uae"
          label="Open to UAE residents"
          checked={!!filters.open_to_uae_residents}
          onChange={(v) => set({ open_to_uae_residents: v ? true : null })}
        />
        <ToggleRow id="f-verified" label="Verified by faculty" checked={filters.verified_only} onChange={(v) => set({ verified_only: v })} />
        <ToggleRow id="f-expired" label="Show expired" checked={filters.include_expired} onChange={(v) => set({ include_expired: v })} />
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <Field label="Degree level">
          <Select
            value={filters.degree_level ?? "any"}
            onValueChange={(v: string) => set({ degree_level: v === "any" ? null : (v as SearchFilters["degree_level"]) })}
          >
            <SelectTrigger aria-label="Degree level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any level</SelectItem>
              <SelectItem value="bachelors">Bachelor&apos;s</SelectItem>
              <SelectItem value="masters">Master&apos;s</SelectItem>
              <SelectItem value="phd">PhD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Funding">
          <Select value={filters.funding} onValueChange={(v: string) => set({ funding: v as SearchFilters["funding"] })}>
            <SelectTrigger aria-label="Funding" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any funding</SelectItem>
              <SelectItem value="funded">Funded (stipend or more)</SelectItem>
              <SelectItem value="fully_funded">Fully funded</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Deadline">
          <Select
            value={filters.deadline_within_days ? String(filters.deadline_within_days) : "any"}
            onValueChange={(v: string) => set({ deadline_within_days: v === "any" ? null : Number(v) })}
          >
            <SelectTrigger aria-label="Deadline" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
              <SelectItem value="90">Next 3 months</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <CheckGroup
        id="type"
        title="Type"
        options={TYPES}
        selected={filters.types}
        label={(t) => TYPE_LABELS[t]}
        onToggle={(t) => set({ types: toggle(filters.types, t) })}
      />
      <CheckGroup
        id="region"
        title="Region"
        options={REGIONS}
        selected={filters.regions}
        label={(r) => REGION_LABELS[r]}
        onToggle={(r) => set({ regions: toggle(filters.regions, r) })}
      />
      <CheckGroup
        id="field"
        title="Field"
        options={FIELD_OPTIONS}
        selected={filters.fields}
        label={(f) => f}
        onToggle={(f) => set({ fields: toggle(filters.fields, f) })}
      />
    </div>
  );
}
