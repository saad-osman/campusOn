"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CompareProfessors,
  FixPlan,
  Document,
  DocumentType,
  KitResponse,
  ProfessorRef,
  ProfessorSearch,
  TrackerItem,
  TrackerStatus,
} from "@/lib/types";

// ---------- tracker (Feature 9) ----------

export function useTracker(workspaceId: string | undefined, opts?: { refetchInterval?: number }) {
  return useQuery<TrackerItem[]>({
    queryKey: ["tracker", workspaceId],
    queryFn: () => api.get<TrackerItem[]>(`/api/workspaces/${workspaceId}/tracker`),
    enabled: !!workspaceId,
    refetchInterval: opts?.refetchInterval,
  });
}

function invalidateFile(qc: ReturnType<typeof useQueryClient>, workspaceId: string) {
  qc.invalidateQueries({ queryKey: ["tracker", workspaceId] });
  qc.invalidateQueries({ queryKey: ["activity", workspaceId] });
  qc.invalidateQueries({ queryKey: ["workspaces"] });
  qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
}

export function useAddToTracker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, opportunityId, status }: { workspaceId: string; opportunityId: string; status?: TrackerStatus }) =>
      api.post<TrackerItem>(`/api/workspaces/${workspaceId}/tracker`, { opportunity_id: opportunityId, status }),
    onSuccess: (item) => {
      invalidateFile(qc, item.workspace_id);
      qc.invalidateQueries({ queryKey: ["saved-opportunities"] });
    },
  });
}

export function usePatchTrackerItem(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: TrackerStatus; assignee_id?: string | null; notes?: string | null }) =>
      api.patch<TrackerItem>(`/api/tracker/${id}`, body),
    onSuccess: () => invalidateFile(qc, workspaceId),
  });
}

export function useReorderTracker(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columns: Partial<Record<TrackerStatus, string[]>>) =>
      api.post<void>(`/api/workspaces/${workspaceId}/tracker/reorder`, { columns }),
    onSettled: () => invalidateFile(qc, workspaceId),
  });
}

export function useDeleteTrackerItem(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/tracker/${id}`),
    onSuccess: () => invalidateFile(qc, workspaceId),
  });
}

export function useRecordOutcome() {
  return useMutation({
    mutationFn: (body: {
      opportunity_id: string;
      result: "accepted" | "rejected" | "waitlisted";
      share_anonymously: boolean;
      workspace_id?: string;
    }) => api.post("/api/outcomes", body),
  });
}

// ---------- professors (Feature 3) ----------

export function useProfessors(params: { q?: string; opportunityId?: string } | null) {
  const qs = params
    ? new URLSearchParams(
        params.opportunityId ? { opportunity_id: params.opportunityId } : { q: params.q ?? "" }
      ).toString()
    : "";
  return useQuery<ProfessorSearch>({
    queryKey: ["professors", qs],
    queryFn: () => api.get<ProfessorSearch>(`/api/professors?${qs}`),
    enabled: params !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** Researchers for the compare page: saved results or AI suggestions, never a live search. */
export function useCompareProfessors(ids: string[]) {
  const sorted = [...ids].sort();
  return useQuery<CompareProfessors[]>({
    queryKey: ["professors-compare", sorted],
    queryFn: () => api.get<CompareProfessors[]>(`/api/professors/compare?ids=${sorted.map(encodeURIComponent).join(",")}`),
    enabled: sorted.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

// ---------- eligibility fix plan ----------

export function useFixPlan(opportunityId: string, enabled: boolean) {
  return useQuery<FixPlan>({
    queryKey: ["fix-plan", opportunityId],
    queryFn: () => api.get<FixPlan>(`/api/opportunities/${opportunityId}/fix-plan`),
    enabled,
  });
}

export function useApplyFixPlan(opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string | null) =>
      api.post<{ workspace_id: string; workspace_name: string; document_id: string; added: number }>(
        `/api/opportunities/${opportunityId}/fix-plan/apply`,
        { workspace_id: workspaceId }
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["workspace", res.workspace_id] });
      qc.invalidateQueries({ queryKey: ["documents", res.workspace_id] });
    },
  });
}

// ---------- copilot (Feature 4) ----------

export function useGenerateKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      opportunity_id: string;
      workspace_id?: string;
      include: ("checklist" | "sop" | "cold_email")[];
      professor?: ProfessorRef;
    }) => api.post<KitResponse>("/api/copilot/kit", body),
    onSuccess: (kit) => {
      invalidateFile(qc, kit.workspace_id);
      qc.invalidateQueries({ queryKey: ["documents", kit.workspace_id] });
    },
  });
}

export function useGenerateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      workspace_id: string;
      type: DocumentType;
      title?: string;
      opportunity_id?: string;
      professor?: ProfessorRef;
    }) => api.post<Document>("/api/copilot/draft", body),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["documents", doc.workspace_id] });
      invalidateFile(qc, doc.workspace_id);
    },
  });
}
