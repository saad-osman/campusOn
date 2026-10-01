"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CVExtraction, Opportunity, OpportunityChange, SearchFilters, SearchResponse } from "@/lib/types";

export const EMPTY_FILTERS: SearchFilters = {
  degree_level: null,
  year: null,
  fields: [],
  funding: "any",
  regions: [],
  types: [],
  deadline_within_days: null,
  remote_only: false,
  open_to_uae_residents: null,
  eligible_only: false,
  verified_only: false,
  include_expired: false,
  semantic_query: null,
};

export function useOpportunities(params: Record<string, string | number | boolean | undefined> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery<Opportunity[]>({
    queryKey: ["opportunities", qs],
    queryFn: () => api.get<Opportunity[]>(`/api/opportunities${qs ? `?${qs}` : ""}`),
  });
}

export function useTopMatches(limit = 6) {
  return useQuery<Opportunity[]>({
    queryKey: ["top-matches", limit],
    queryFn: () => api.get<Opportunity[]>(`/api/opportunities/matches/top?limit=${limit}`),
  });
}

export function useSavedOpportunities() {
  return useQuery<Opportunity[]>({
    queryKey: ["saved-opportunities"],
    queryFn: () => api.get<Opportunity[]>("/api/opportunities/saved/mine"),
  });
}

export function useOpportunity(id: string | undefined) {
  return useQuery<Opportunity>({
    queryKey: ["opportunity", id],
    queryFn: () => api.get<Opportunity>(`/api/opportunities/${id}`),
    enabled: !!id,
  });
}

export function useOpportunityChanges(id: string | undefined) {
  return useQuery<OpportunityChange[]>({
    queryKey: ["opportunity-changes", id],
    queryFn: () => api.get<OpportunityChange[]>(`/api/opportunities/${id}/changes`),
    enabled: !!id,
  });
}

export type SearchArgs = { q?: string; filters?: SearchFilters; sort?: "match" | "deadline" | "newest" };

export function useSearch(args: SearchArgs | null) {
  return useQuery<SearchResponse>({
    queryKey: ["search", args],
    queryFn: () => api.post<SearchResponse>("/api/opportunities/search", args),
    enabled: args !== null,
    placeholderData: (prev) => prev,
  });
}

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      saved ? api.delete<void>(`/api/opportunities/${id}/save`) : api.post<void>(`/api/opportunities/${id}/save`),
    onSuccess: (_data, { id, saved }) => {
      // Flip the flag everywhere this opportunity is cached, then refetch the saved list.
      const flip = (o: Opportunity) => (o.id === id ? { ...o, saved: !saved } : o);
      qc.setQueriesData<Opportunity[]>({ queryKey: ["opportunities"] }, (old) => old?.map(flip));
      qc.setQueriesData<Opportunity[]>({ queryKey: ["top-matches"] }, (old) => old?.map(flip));
      qc.setQueriesData<SearchResponse>({ queryKey: ["search"] }, (old) =>
        old ? { ...old, results: old.results.map(flip) } : old
      );
      qc.setQueryData<Opportunity>(["opportunity", id], (old) => (old ? flip(old) : old));
      qc.invalidateQueries({ queryKey: ["saved-opportunities"] });
    },
  });
}

export function useUploadCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<CVExtraction>("/api/profile/cv", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
