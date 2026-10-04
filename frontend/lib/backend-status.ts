/*
 * Is the API reachable? The free Render host sleeps when idle (the first request takes about
 * a minute to wake it) and restarts after a crash; meanwhile every API call fails and pages
 * would render blank. This store watches /api/health so the app can show a "Waking up the
 * server" screen instead and carry on by itself once the server answers.
 *
 * Plain module state (no React): lib/api.ts reports failed calls here, components read it
 * through useBackendStatus(). The screen only ever shows after /api/health itself fails,
 * so one bad request can't trigger it.
 */
import * as React from "react";

export type BackendStatus =
  | "unknown" // not checked yet
  | "checking" // a health check is in flight
  | "up"
  | "waking" // health failed; retrying every few seconds
  | "down"; // still failing after GIVE_UP_MS; the user can retry

const POLL_MS = 4_000;
const ATTEMPT_TIMEOUT_MS = 10_000;
/** Render's free plan usually wakes in under a minute; give it two. */
export const GIVE_UP_MS = 120_000;

let status: BackendStatus = "unknown";
let wakingSince: number | null = null;
let running = false;
const listeners = new Set<() => void>();
const recoveredListeners = new Set<() => void>();

function set(next: BackendStatus) {
  if (next === status) return;
  const recovered = next === "up" && (status === "waking" || status === "down");
  status = next;
  if (next === "waking" && wakingSince === null) wakingSince = Date.now();
  if (next === "up") wakingSince = null;
  listeners.forEach((l) => l());
  if (recovered) recoveredListeners.forEach((l) => l());
}

async function healthy(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Check health now; on failure keep retrying until the server answers or GIVE_UP_MS passes. */
export async function checkBackend(): Promise<void> {
  if (running || typeof window === "undefined") return;
  running = true;
  try {
    if (status !== "waking" && status !== "down") set("checking");
    if (status === "down") {
      wakingSince = Date.now(); // a manual retry starts a fresh two minutes
      set("waking");
    }
    for (;;) {
      if (await healthy()) {
        set("up");
        return;
      }
      set("waking");
      if (Date.now() - (wakingSince ?? Date.now()) >= GIVE_UP_MS) {
        set("down");
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    running = false;
  }
}

/** lib/api.ts calls this when a request fails the way an unreachable server fails. */
export function reportUnavailable() {
  void checkBackend();
}

/** Resolves once the server is up; rejects if it gives up ("down"). */
export function waitForBackend(): Promise<void> {
  void checkBackend();
  return new Promise((resolve, reject) => {
    const settle = () => {
      if (status === "up") {
        listeners.delete(settle);
        resolve();
      } else if (status === "down") {
        listeners.delete(settle);
        reject(new Error("The server isn't responding. Try again in a minute."));
      }
    };
    listeners.add(settle);
    settle();
  });
}

/** Run `fn` when the server comes back after being unreachable (refetch data, etc.). */
export function onBackendRecovered(fn: () => void): () => void {
  recoveredListeners.add(fn);
  return () => recoveredListeners.delete(fn);
}

export function getWakingSince() {
  return wakingSince;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useBackendStatus(): BackendStatus {
  // The server render always says "unknown", so the first client render matches it.
  return React.useSyncExternalStore(subscribe, () => status, () => "unknown");
}
