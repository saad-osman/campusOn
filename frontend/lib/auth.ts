"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ["me"],
    // /session answers 200 with `user: null` when logged out (no console 401s).
    queryFn: async () => (await api.get<{ user: User | null }>("/api/auth/session")).user,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<User>("/api/auth/login", body),
    // Drop anything cached for a previous account before showing this one's data.
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(["me"], user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api.post<User>("/api/auth/register", body),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(["me"], user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout"),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
    },
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

/** Like useRequireUser, but also sends users without one of `roles` back to the dashboard. */
export function useRequireRole(roles: User["role"][], nextPath: string) {
  const query = useRequireUser(nextPath);
  const router = useRouter();
  const allowed = !!query.data && roles.includes(query.data.role);
  React.useEffect(() => {
    if (query.data && !roles.includes(query.data.role)) router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, router]);
  return { ...query, allowed };
}
