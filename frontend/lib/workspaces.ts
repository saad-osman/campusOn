"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  ActivityLogEntry,
  Document,
  DocumentType,
  DocumentVersion,
  Invite,
  InvitePreview,
  MemberRole,
  Workspace,
  WorkspaceMember,
  WorkspaceTemplate,
} from "@/lib/types";

// ---------- workspaces ----------

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: () => api.get<Workspace[]>("/api/workspaces"),
  });
}

export function useWorkspace(id: string | undefined) {
  return useQuery<Workspace>({
    queryKey: ["workspace", id],
    queryFn: () => api.get<Workspace>(`/api/workspaces/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; icon?: string; template: WorkspaceTemplate }) =>
      api.post<Workspace>("/api/workspaces", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function usePatchWorkspace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<Workspace, "name" | "description" | "icon" | "archived">>) =>
      api.patch<Workspace>(`/api/workspaces/${id}`, body),
    onSuccess: (ws) => {
      qc.setQueryData(["workspace", id], ws);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/workspaces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useDuplicateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Workspace>(`/api/workspaces/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

// ---------- members ----------

export function useMembers(workspaceId: string | undefined) {
  return useQuery<WorkspaceMember[]>({
    queryKey: ["members", workspaceId],
    queryFn: () => api.get<WorkspaceMember[]>(`/api/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });
}

export function useUpdateMemberRole(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: MemberRole }) =>
      api.patch<WorkspaceMember>(`/api/workspaces/${workspaceId}/members/${memberId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", workspaceId] }),
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.delete<void>(`/api/workspaces/${workspaceId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", workspaceId] }),
  });
}

// ---------- invites ----------

export function useInvites(workspaceId: string | undefined) {
  return useQuery<Invite[]>({
    queryKey: ["invites", workspaceId],
    queryFn: () => api.get<Invite[]>(`/api/workspaces/${workspaceId}/invites`),
    enabled: !!workspaceId,
  });
}

export function useCreateInvite(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: "editor" | "viewer" }) =>
      api.post<Invite>(`/api/workspaces/${workspaceId}/invites`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", workspaceId] }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery<InvitePreview>({
    queryKey: ["invite-preview", token],
    queryFn: () => api.get<InvitePreview>(`/api/invites/${token}`),
  });
}

export function useAcceptInvite() {
  return useMutation({
    mutationFn: (token: string) => api.post<WorkspaceMember>(`/api/invites/${token}/accept`),
  });
}

// ---------- documents ----------

export function useDocuments(workspaceId: string | undefined) {
  return useQuery<Document[]>({
    queryKey: ["documents", workspaceId],
    queryFn: () => api.get<Document[]>(`/api/workspaces/${workspaceId}/documents`),
    enabled: !!workspaceId,
  });
}

export function useDocument(id: string | undefined, opts?: { refetchInterval?: number }) {
  return useQuery<Document>({
    queryKey: ["document", id],
    queryFn: () => api.get<Document>(`/api/documents/${id}`),
    enabled: !!id,
    refetchInterval: opts?.refetchInterval,
  });
}

export function useCreateDocument(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: DocumentType; title: string; opportunity_id?: string }) =>
      api.post<Document>(`/api/workspaces/${workspaceId}/documents`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", workspaceId] });
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      qc.invalidateQueries({ queryKey: ["activity", workspaceId] });
    },
  });
}

export interface DocumentConflict {
  message: string;
  current: Document;
}

export function usePatchDocument(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string; content?: string; base_version: number }) =>
      api.patch<Document>(`/api/documents/${documentId}`, body),
    onSuccess: (doc) => {
      qc.setQueryData(["document", documentId], doc);
      qc.invalidateQueries({ queryKey: ["documents", doc.workspace_id] });
      // Readiness (on the File and the Files list) is computed from document contents.
      qc.invalidateQueries({ queryKey: ["workspace", doc.workspace_id] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function getConflict(err: unknown): DocumentConflict | null {
  if (err instanceof ApiError && err.status === 409 && err.detail && typeof err.detail === "object") {
    const detail = err.detail as Partial<DocumentConflict>;
    if (detail.current) return detail as DocumentConflict;
  }
  return null;
}

export function useDocumentVersions(documentId: string | undefined) {
  return useQuery<DocumentVersion[]>({
    queryKey: ["document-versions", documentId],
    queryFn: () => api.get<DocumentVersion[]>(`/api/documents/${documentId}/versions`),
    enabled: !!documentId,
  });
}

export function useRestoreVersion(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.post<Document>(`/api/documents/${documentId}/versions/${version}/restore`),
    onSuccess: (doc) => {
      qc.setQueryData(["document", documentId], doc);
      qc.invalidateQueries({ queryKey: ["document-versions", documentId] });
    },
  });
}

// ---------- activity ----------

export function useActivity(workspaceId: string | undefined, opts?: { refetchInterval?: number }) {
  return useQuery<ActivityLogEntry[]>({
    queryKey: ["activity", workspaceId],
    queryFn: () => api.get<ActivityLogEntry[]>(`/api/workspaces/${workspaceId}/activity`),
    enabled: !!workspaceId,
    refetchInterval: opts?.refetchInterval,
  });
}
