"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Outreach } from "@/lib/types";

/** Professors the student has emailed (newest follow-ups due first). */
export function useOutreach() {
  return useQuery<Outreach[]>({ queryKey: ["outreach"], queryFn: () => api.get<Outreach[]>("/api/outreach") });
}

export type LogOutreachBody = {
  professor_name: string;
  affiliation?: string | null;
  author_id?: string | null;
  profile_url?: string | null;
  paper_title?: string | null;
  opportunity_id?: string | null;
};

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["outreach"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useLogOutreach() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: LogOutreachBody) => api.post<Outreach>("/api/outreach", body), onSuccess: invalidate });
}

export function useUpdateOutreach() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: Outreach["status"]; followed_up?: boolean; notes?: string }) =>
      api.patch<Outreach>(`/api/outreach/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteOutreach() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete<void>(`/api/outreach/${id}`), onSuccess: invalidate });
}
