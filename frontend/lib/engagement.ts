"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import type { AppNotification, MyEndorsement, NotificationSettings, Opportunity, ReviewDetail } from "@/lib/types";

// ---------- notifications ----------

export function useNotifications() {
  const { data: user } = useCurrentUser();
  return useQuery<{ items: AppNotification[]; unread_count: number }>({
    queryKey: ["notifications"],
    queryFn: () => api.get("/api/notifications?limit=30"),
    enabled: !!user,
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | "all") =>
      id === "all" ? api.post<void>("/api/notifications/read-all") : api.post<void>(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useNotificationSettings() {
  return useQuery<NotificationSettings>({
    queryKey: ["notification-settings"],
    queryFn: () => api.get("/api/settings/notifications"),
  });
}

export function usePatchNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<NotificationSettings["prefs"]>) =>
      api.patch<NotificationSettings>("/api/settings/notifications", prefs),
    onSuccess: (s) => qc.setQueryData(["notification-settings"], s),
  });
}

export function useTelegramCode() {
  return useMutation({
    mutationFn: () =>
      api.post<{ code: string; expires_at: string; bot_username: string | null; bot_running: boolean }>(
        "/api/settings/telegram/code"
      ),
  });
}

export function useDisconnectTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>("/api/settings/telegram"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-settings"] }),
  });
}

// ---------- review queue (Feature 6) ----------

export type ReviewKind = "pending" | "unverified" | "broken";

export function useReviewQueue(kind: ReviewKind) {
  return useQuery<Opportunity[]>({
    queryKey: ["review-queue", kind],
    queryFn: () => api.get(`/api/review/queue?kind=${kind}`),
  });
}

export function useReviewDetail(id: string | null) {
  return useQuery<ReviewDetail>({
    queryKey: ["review", id],
    queryFn: () => api.get(`/api/review/${id}`),
    enabled: !!id,
  });
}

export function useReviewAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; action: "approve" | "reject" | "save"; edits: Record<string, unknown> }) =>
      api.patch<Opportunity>(`/api/review/${id}`, body),
    onSuccess: (opp) => {
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review", opp.id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
  });
}

// ---------- endorsements (Feature 12) ----------

export function useMyEndorsements() {
  return useQuery<MyEndorsement[]>({ queryKey: ["my-endorsements"], queryFn: () => api.get("/api/endorsements/mine") });
}

export function useEndorsedForMe() {
  return useQuery<Opportunity[]>({ queryKey: ["endorsed-for-me"], queryFn: () => api.get("/api/endorsements/for-me") });
}

export function useCreateEndorsement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      opportunity_id: string;
      note?: string;
      target_degree_level?: string | null;
      target_year?: number | null;
      target_major?: string | null;
    }) => api.post<MyEndorsement>("/api/endorsements", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-endorsements"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
  });
}

export function useDeleteEndorsement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/endorsements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-endorsements"] }),
  });
}

export function useSendDigestNow() {
  return useMutation({
    mutationFn: () => api.post<{ students: number; in_app: number; email: number; telegram: number }>("/api/admin/digest/send"),
  });
}
