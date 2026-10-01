"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";

export function useProfile() {
  return useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => api.get<Profile>("/api/profile"),
  });
}

export function usePatchProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Profile>) => api.patch<Profile>("/api/profile", body),
    onSuccess: (profile) => {
      qc.setQueryData(["profile"], profile);
      // Eligibility verdicts and match scores depend on the profile.
      for (const key of ["opportunities", "top-matches", "search", "opportunity", "saved-opportunities"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
