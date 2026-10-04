"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { HINT_COOKIE, HINT_MAX_AGE } from "@/lib/session-hint";

// ---------- signed-in hint ----------
// The session cookie is httpOnly, so the page can't tell whether someone is signed in until
// /api/auth/session answers, which takes up to a minute while the free API host wakes up.
// `lodestar_hint=1` is a readable mirror of it (kept by middleware.ts, and set/cleared here on
// login/logout). It only decides what to *show* while the session is unknown (nav links, home
// CTAs); it never grants access, and the real session always wins once it loads.
const hintListeners = new Set<() => void>();

function readHint() {
  return document.cookie.split("; ").includes(`${HINT_COOKIE}=1`);
}

function setSessionHint(on: boolean) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = on
    ? `${HINT_COOKIE}=1; path=/; max-age=${HINT_MAX_AGE}; samesite=lax${secure}`
    : `${HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  hintListeners.forEach((l) => l());
}

function subscribeHint(fn: () => void) {
  hintListeners.add(fn);
  return () => hintListeners.delete(fn);
}

/** Was this browser signed in? `null` on the server and the first (hydrating) render. */
export function useSessionHint(): boolean | null {
  return React.useSyncExternalStore(subscribeHint, readHint, () => null);
}

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
      setSessionHint(true);
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
      setSessionHint(true);
    },
  });
}

/** Rename the signed-in user (PATCH /api/auth/me); the nav and menus update from the cache. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.patch<User>("/api/auth/me", body),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout"),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
      setSessionHint(false);
    },
  });
}

/** Client-side guard for pages behind login: redirects to /login?next=<path>. */
export function useRequireUser(nextPath: string) {
  const query = useCurrentUser();
  const router = useRouter();
  React.useEffect(() => {
    // `null` = logged out. `undefined` = the check failed (server asleep): BackendGate shows the
    // waking screen and refetches, so don't send the user to /login over it.
    if (!query.isLoading && query.data === null) router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
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
