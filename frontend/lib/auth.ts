"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<User>("/api/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<User>("/api/auth/login", body),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api.post<User>("/api/auth/register", body),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout"),
    onSuccess: () => qc.setQueryData(["me"], null),
  });
}

/** Client-side guard for pages behind login: redirects to /login?next=<path>. */
export function useRequireUser(nextPath: string) {
  const query = useCurrentUser();
  const router = useRouter();
  React.useEffect(() => {
    if (!query.isLoading && !query.data) router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [query.isLoading, query.data, router, nextPath]);
  return query;
}
