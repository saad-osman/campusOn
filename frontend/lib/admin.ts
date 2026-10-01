"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Analytics {
  headline: {
    sources_monitored: number;
    active_opportunities: number;
    verified_pct: number;
    avg_confidence: number;
    students_with_application: number;
    students_total: number;
    pending_review: number;
    broken: number;
  };
  by_type: { name: string; count: number }[];
  by_field: { name: string; count: number }[];
  by_funding: { name: string; count: number }[];
  by_region: { name: string; count: number }[];
  new_per_week: { week: string; count: number }[];
  activity_per_week: { week: string; saves: number; applications: number }[];
  top_interests: { name: string; count: number }[];
  outcomes_per_term: { term: string; accepted: number; rejected: number; waitlisted: number }[];
  success_stories: string[];
}

export interface SourceRow {
  id: string;
  name: string;
  base_url: string;
  region: string;
  active: boolean;
  last_checked: string | null;
  last_status: string | null;
  notes: string | null;
}

export interface ScrapeRun {
  id: string;
  source_id: string | null;
  status: "running" | "ok" | "failed";
  pages_fetched: number;
  new_count: number;
  updated_count: number;
  merged_count: number;
  failed_count: number;
  started_at: string;
  finished_at: string | null;
  detail: Record<string, unknown>;
}

export function useAnalytics() {
  return useQuery<Analytics>({ queryKey: ["analytics"], queryFn: () => api.get("/api/admin/analytics") });
}

export function useSources() {
  return useQuery<SourceRow[]>({ queryKey: ["sources"], queryFn: () => api.get("/api/sources") });
}

export function useScrapeRuns() {
  return useQuery<ScrapeRun[]>({ queryKey: ["scrape-runs"], queryFn: () => api.get("/api/sources/runs/recent") });
}

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["sources", "scrape-runs", "analytics", "review-queue", "opportunities"]) qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateSource() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (body: { name: string; base_url: string; region: string; notes?: string }) => api.post<SourceRow>("/api/sources", body),
    onSuccess: invalidate,
  });
}

export function usePatchSource() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; active?: boolean }) => api.patch<SourceRow>(`/api/sources/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useScrapeSource() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (id: string) => api.post<ScrapeRun>(`/api/sources/${id}/scrape`),
    onSettled: invalidate,
  });
}

export function useArchiveSweep() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: () => api.post<{ archived_count: number }>("/api/sources/archive-sweep"),
    onSuccess: invalidate,
  });
}
