"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserState } from "@/lib/types";
import { useCurrentUser } from "@/lib/auth";

export function useUserState() {
  const { data: user } = useCurrentUser();
  return useQuery<UserState>({
    queryKey: ["state"],
    queryFn: () => api.get<UserState>("/api/state"),
    enabled: !!user,
  });
}

export function usePatchState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<UserState>) => api.patch<UserState>("/api/state", body),
    onSuccess: (state) => qc.setQueryData(["state"], state),
  });
}

/**
 * Records the current route as `last_route` for "Continue where you left off"
 * (Section 4.2). Debounced server-side too, but we only fire this once per
 * mount here since these are full page components, not a router-wide listener.
 */
export function useTrackRoute(pathname: string) {
  const { data: user } = useCurrentUser();
  const patchState = usePatchState();
  const firedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (user && firedFor.current !== pathname) {
      firedFor.current = pathname;
      patchState.mutate({ last_route: pathname });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pathname]);
}
