import type { FundingType, OpportunityType, Region, Verdict } from "@/lib/types";

export const TYPE_LABELS: Record<OpportunityType, string> = {
  research_internship: "Research internship",
  fellowship: "Fellowship",
  grant: "Grant",
  scholarship: "Scholarship",
  research_position: "Research position",
  summer_school: "Summer school",
};

export const FUNDING_LABELS: Record<FundingType, string> = {
  fully_funded: "Fully funded",
  stipend: "Stipend",
  partial: "Partial funding",
  unfunded: "Unfunded",
  unknown: "Funding unclear",
};

export const REGION_LABELS: Record<Region, string> = {
  uae: "UAE",
  gcc: "GCC",
  europe: "Europe",
  usa: "North America",
  india: "India",
  asia: "Asia",
  global: "Global",
};

export const DEGREE_LABELS: Record<string, string> = {
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
  postdoc: "Postdoc",
  any: "Any level",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  eligible: "Eligible",
  partially_eligible: "Partially eligible",
  not_eligible: "Not eligible",
  unknown: "Eligibility unknown",
};

export const FIELD_OPTIONS = [
  "AI/ML",
  "Computer Science",
  "Data Science",
  "Engineering",
  "Public Policy",
  "Business",
  "Natural Sciences",
  "Social Sciences",
  "Medicine",
];

/** Whole days from today (local) to an ISO date; negative when past. */
export function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "No fixed deadline";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Backend timestamps are naive UTC; treat them as UTC. */
export function parseServerTime(ts: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(ts) ? ts : `${ts}Z`);
}

export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - parseServerTime(ts).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
