"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            <X className="size-3" aria-hidden />
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

function CheckRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function FilterSidebar({ filters, onChange }: { filters: SearchFilters; onChange: (f: SearchFilters) => void }) {
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="f-eligible" className="text-sm">Only ones I can apply to</Label>
          <Switch id="f-eligible" checked={filters.eligible_only} onCheckedChange={(v) => set({ eligible_only: v })} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="f-uae" className="text-sm">Open to UAE residents</Label>
          <Switch
            id="f-uae"
            checked={!!filters.open_to_uae_residents}
            onCheckedChange={(v) => set({ open_to_uae_residents: v ? true : null })}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="f-verified" className="text-sm">Verified by faculty</Label>
          <Switch id="f-verified" checked={filters.verified_only} onCheckedChange={(v) => set({ verified_only: v })} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="f-expired" className="text-sm">Show expired</Label>
          <Switch id="f-expired" checked={filters.include_expired} onCheckedChange={(v) => set({ include_expired: v })} />
        </div>
      </div>

      <Section title="Degree level">
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
      </Section>

      <Section title="Funding">
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
      </Section>

      <Section title="Deadline">
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
      </Section>

      <Section title="Type">
        {(Object.keys(TYPE_LABELS) as OpportunityType[]).map((t) => (
          <CheckRow key={t} id={`f-type-${t}`} label={TYPE_LABELS[t]} checked={filters.types.includes(t)}
            onChange={() => set({ types: toggle(filters.types, t) })} />
        ))}
      </Section>

      <Section title="Region">
        {(["uae", "gcc", "europe", "usa", "asia", "india"] as Region[]).map((r) => (
          <CheckRow key={r} id={`f-region-${r}`} label={REGION_LABELS[r]} checked={filters.regions.includes(r)}
            onChange={() => set({ regions: toggle(filters.regions, r) })} />
        ))}
      </Section>

      <Section title="Field">
        {FIELD_OPTIONS.map((field) => (
          <CheckRow key={field} id={`f-field-${field}`} label={field} checked={filters.fields.includes(field)}
            onChange={() => set({ fields: toggle(filters.fields, field) })} />
        ))}
      </Section>
    </div>
  );
}
