"use client";

import * as React from "react";

/** The one entrance easing used across the app (fast start, gentle settle). */
export const EASE_OUT = "cubic-bezier(0.2, 0.7, 0.2, 1)";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The OS setting right now (false on the server). Use it inside effects before creating animations. */
export function prefersReducedMotionNow(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

// Set once the app has hydrated. Components that mount after that are client-only renders,
// so they can read the real setting on their first render (no one-frame flash of motion).
let hydrated = false;

/**
 * True when the OS asks for reduced motion. During hydration it starts false (matching the
 * server markup) and updates after mount; components mounted later get the real value at
 * once. Follows live changes to the setting.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(() => hydrated && prefersReducedMotionNow());
  React.useEffect(() => {
    hydrated = true;
    const mq = window.matchMedia(QUERY);
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A number that counts up to `target` (easeOutCubic, requestAnimationFrame).
 * Runs once on mount after `delay`; a later change to `target` animates from the value
 * currently shown. Disabled or under reduced motion it is simply `target`.
 * The server and first render show `target` (so reduced-motion readers never see 0);
 * a layout effect drops it to 0 before the first paint when it is going to animate.
 */
export function useCountUp(
  target: number,
  { duration = 1000, delay = 0, enabled = true }: { duration?: number; delay?: number; enabled?: boolean } = {}
): number {
  const reduced = usePrefersReducedMotion();
  const active = enabled && !reduced;
  const [value, setValue] = React.useState(target);
  const shown = React.useRef(target);
  const started = React.useRef(false);

  useIsoLayoutEffect(() => {
    if (enabled && !prefersReducedMotionNow()) {
      shown.current = 0;
      setValue(0);
    }
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!active) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    // Only the first run waits for `delay`; later target changes follow at once.
    // (Marked when the timer fires, so a cancelled run, e.g. StrictMode, keeps the delay.)
    const wait = started.current ? 0 : delay;
    let raf = 0;
    const timer = window.setTimeout(() => {
      started.current = true;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const next = from + (target - from) * easeOutCubic(t);
        shown.current = next;
        setValue(next);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, wait);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay, active]);

  return active ? value : target;
}
