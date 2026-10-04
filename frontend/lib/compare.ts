"use client";

/*
 * Opportunities picked for /compare (up to 4), per user, in localStorage. Plain module state
 * read through useSyncExternalStore, so the nav badge, the detail page button and the compare
 * page stay in sync; the `storage` event keeps other tabs in sync too.
 *
 * Not kept in /api/state ui_state on purpose: that endpoint drops writes closer than 2.5s
 * apart, and useTrackRoute already writes on every page load, so compare clicks would be lost.
 */
import * as React from "react";
import { useCurrentUser } from "@/lib/auth";

export const MAX_COMPARE = 4;

type State = { userId: string | null; ids: string[] };

const EMPTY: string[] = [];
// The server render and the first client render both see this, so hydration matches.
const SERVER_STATE: State = { userId: null, ids: EMPTY };

let state: State = SERVER_STATE;
const listeners = new Set<() => void>();
let storageListening = false;

const storageKey = (userId: string) => `lodestar:compare:${userId}`;

function read(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((x): x is string => typeof x === "string");
    return Array.from(new Set(ids)).slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

function write(userId: string, ids: string[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    /* private window or blocked storage: the list still works for this page view */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function load(userId: string | null) {
  if (state.userId === userId) return;
  state = { userId, ids: userId ? read(userId) : EMPTY };
  emit();
}

function setIds(ids: string[]) {
  const { userId } = state;
  if (!userId) return;
  state = { userId, ids };
  write(userId, ids);
  emit();
}

function onStorage(e: StorageEvent) {
  if (state.userId && e.key === storageKey(state.userId)) {
    state = { ...state, ids: read(state.userId) };
    emit();
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!storageListening && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    storageListening = true;
  }
  return () => listeners.delete(fn);
}

export type AddResult = "added" | "exists" | "full" | "unavailable";

export function useCompare() {
  const { data: user } = useCurrentUser();
  const userId = user?.id ?? null;
  // `undefined` user = the session check hasn't answered (or the server is asleep): keep what we have.
  React.useEffect(() => {
    if (user !== undefined) load(userId);
  }, [user, userId]);

  const snap = React.useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  const ready = !!userId && snap.userId === userId;
  const ids = ready ? snap.ids : EMPTY;

  return React.useMemo(() => {
    const has = (id: string) => ids.includes(id);
    const add = (id: string): AddResult => {
      if (!ready) return "unavailable";
      if (state.ids.includes(id)) return "exists";
      if (state.ids.length >= MAX_COMPARE) return "full";
      setIds([...state.ids, id]);
      return "added";
    };
    const remove = (id: string) => setIds(state.ids.filter((x) => x !== id));
    const removeMany = (drop: string[]) => setIds(state.ids.filter((x) => !drop.includes(x)));
    const toggle = (id: string): AddResult | "removed" => {
      if (state.ids.includes(id)) {
        remove(id);
        return "removed";
      }
      return add(id);
    };
    const clear = () => setIds([]);
    return { ids, ready, has, add, remove, removeMany, toggle, clear, isFull: ids.length >= MAX_COMPARE };
  }, [ids, ready]);
}
