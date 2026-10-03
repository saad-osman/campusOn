"use client";

/*
 * FolderFloat, ported from React Bits (https://reactbits.dev) to TypeScript.
 * Lodestar changes:
 * - items are { label, value, href?, disabled? }; when they change while open (e.g. "Loading…"
 *   replaced by documents) the physics world stops, pills re-measure and re-layout, and physics
 *   restarts after the rise, with no stale bodies left behind.
 * - colours come from the --folder-* tokens (folder-float.css); no gradient, no scale-on-hover.
 * - hover opens only for a real mouse; a click after a hover-open keeps it open (the original
 *   closed it), later clicks toggle; touch taps toggle.
 * - closes on an outside pointerdown and on Escape (focus returns to the folder button).
 * - reduced motion: CSS keeps it to fades, and physics never starts.
 * Load it with next/dynamic and { ssr: false } so matter-js ships only where it is used.
 */
import * as React from "react";
import Matter from "matter-js";
import { usePrefersReducedMotion } from "@/lib/motion";
import "./folder-float.css";

const { Bodies, Body, Composite, Engine } = Matter;

export type FolderItem = { label: string; value: string; href?: string; disabled?: boolean };

type Pos = { x: number; y: number; r: number };
type Size = { w: number; h: number };
type Zone = { left: number; right: number; top: number; bottom: number };
type Drag = { i: number; id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean };
type World = {
  engine: Matter.Engine | null;
  bodies: Matter.Body[];
  sizes: Size[];
  raf: number;
  last: number;
  t0: number;
  drag: Drag | null;
  zone: Zone | null;
  live: boolean;
};

const PAD = 28;
const CHAR = 6.8;
const GAP = 12;
const ROW = 52;
const DRAG_MIN = 4;
const ZONE_PAD = 8;

const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
};

function layout(list: FolderItem[], spread: number, lift: number, tilt: number, sizes: Size[]): Pos[] {
  const rows: { items: { i: number; pw: number }[]; width: number }[] = [];
  let row: { i: number; pw: number }[] = [];
  let width = 0;
  list.forEach((item, i) => {
    const pw = sizes[i]?.w ?? PAD + item.label.length * CHAR;
    if (row.length && width + GAP + pw > spread * 2) {
      rows.push({ items: row, width });
      row = [];
      width = 0;
    }
    row.push({ i, pw });
    width += (row.length > 1 ? GAP : 0) + pw;
  });
  if (row.length) rows.push({ items: row, width });
  const pos: Pos[] = [];
  rows.forEach((r, ri) => {
    let x = -r.width / 2;
    const shift = (ri % 2 ? 1 : -1) * Math.min(16, spread * 0.1);
    r.items.forEach(({ i, pw }) => {
      const j = jitter(i);
      pos[i] = { x: x + pw / 2 + shift + (j - 0.5) * 6, y: -lift - ri * ROW - j * 6, r: tilt * (j * 2 - 1) };
      x += pw + GAP;
    });
  });
  return pos;
}

export type FolderFloatProps = {
  items: FolderItem[];
  label: string;
  sublabel?: string;
  trigger?: "hover" | "click";
  defaultOpen?: boolean;
  closeOnSelect?: boolean;
  physics?: boolean;
  drift?: number;
  onSelect?: (item: FolderItem, index: number) => void;
  onOpenChange?: (open: boolean) => void;
  width?: number;
  height?: number;
  radius?: number;
  spread?: number;
  lift?: number;
  tilt?: number;
  flapAngle?: number;
  restAngle?: number;
  openDuration?: number;
  stagger?: number;
  bounce?: number;
  /** Lodestar: moves the pill cloud sideways (px) so it stays inside the viewport. */
  shift?: number;
  className?: string;
};

export default function FolderFloat({
  items,
  label,
  sublabel = "",
  trigger = "hover",
  defaultOpen = false,
  closeOnSelect = true,
  physics = true,
  drift = 0.5,
  onSelect,
  onOpenChange,
  width = 200,
  height = 148,
  radius = 14,
  spread = 180,
  lift = 26,
  tilt = 8,
  flapAngle = 34,
  restAngle = 16,
  openDuration = 520,
  stagger = 45,
  bounce = 0.3,
  shift = 0,
  className = "",
}: FolderFloatProps) {
  const reduce = usePrefersReducedMotion();
  const [open, setOpen] = React.useState(defaultOpen);
  const [popped, setPopped] = React.useState(-1);
  const [live, setLive] = React.useState(false);
  const [sizes, setSizes] = React.useState<Size[]>([]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const pillRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const world = React.useRef<World>({
    engine: null,
    bodies: [],
    sizes: [],
    raf: 0,
    last: 0,
    t0: 0,
    drag: null,
    zone: null,
    live: false,
  });
  const latest = React.useRef({ onSelect, onOpenChange, drift });
  latest.current = { onSelect, onOpenChange, drift };
  const openRef = React.useRef(open);
  openRef.current = open;
  // Opened by a mouse hover (not yet "pinned" by a click): leaving closes it again.
  const byHover = React.useRef(false);
  const popTimer = React.useRef<number | undefined>(undefined);
  const liveTimer = React.useRef<number | undefined>(undefined);

  const n = items.length;
  const sub = sublabel || `${n} ${n === 1 ? "item" : "items"}`;
  const pos = layout(items, spread, lift, tilt, sizes);
  const posRef = React.useRef(pos);
  posRef.current = pos;
  const posKey = pos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
  const labelsKey = items.map((item) => item.label).join("|");

  React.useLayoutEffect(() => {
    const measure = () => {
      const els = pillRefs.current.slice(0, n);
      if (els.length < n || els.some((el) => !el)) return;
      const next = els.map((el) => ({ w: el!.offsetWidth, h: el!.offsetHeight }));
      setSizes((prev) =>
        prev.length === next.length && prev.every((s, i) => s.w === next[i].w && s.h === next[i].h) ? prev : next
      );
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [n, labelsKey]);

  const stopPhysics = React.useCallback(() => {
    const w = world.current;
    window.clearTimeout(liveTimer.current);
    cancelAnimationFrame(w.raf);
    w.raf = 0;
    if (w.engine) {
      w.bodies.forEach((b, i) => {
        const el = pillRefs.current[i];
        if (!el || !w.sizes[i]) return;
        el.style.setProperty("--x", `${b.position.x.toFixed(1)}px`);
        el.style.setProperty("--y", `${(b.position.y - w.sizes[i].h / 2).toFixed(1)}px`);
      });
      Composite.clear(w.engine.world, false, true);
      Engine.clear(w.engine);
      w.engine = null;
    }
    w.bodies = [];
    w.drag = null;
    w.live = false;
    setLive(false);
  }, []);

  const startPhysics = React.useCallback(() => {
    const w = world.current;
    if (w.engine) return;
    const els = pillRefs.current.slice(0, n);
    if (!n || els.length < n || els.some((el) => !el)) return;
    const p = posRef.current;
    const engine = Engine.create({ gravity: { x: 0, y: 0 } });
    engine.enableSleeping = false;
    w.engine = engine;
    w.sizes = els.map((el) => ({ w: el!.offsetWidth, h: el!.offsetHeight }));
    const ys = p.map((q) => q.y);
    const zone: Zone = {
      left: -spread - ZONE_PAD,
      right: spread + ZONE_PAD,
      top: Math.min(...ys) - ZONE_PAD,
      bottom: -lift + Math.max(...w.sizes.map((s) => s.h)),
    };
    w.zone = zone;
    w.bodies = els.map((_, i) => {
      const { w: bw, h: bh } = w.sizes[i];
      const b = Bodies.rectangle(p[i].x, p[i].y + bh / 2, bw, bh, {
        chamfer: { radius: Math.min(bh / 2 - 1, 16) },
        restitution: 0.55,
        friction: 0,
        frictionAir: 0.08,
        inertia: Infinity,
      });
      b.plugin = { phase: jitter(i) * Math.PI * 2 };
      return b;
    });
    const T = 80;
    const cx = (zone.left + zone.right) / 2;
    const cy = (zone.top + zone.bottom) / 2;
    const zw = zone.right - zone.left + 2 * T;
    const zh = zone.bottom - zone.top + 2 * T;
    const walls = [
      Bodies.rectangle(cx, zone.top - T / 2, zw, T, { isStatic: true }),
      Bodies.rectangle(cx, zone.bottom + T / 2, zw, T, { isStatic: true }),
      Bodies.rectangle(zone.left - T / 2, cy, T, zh, { isStatic: true }),
      Bodies.rectangle(zone.right + T / 2, cy, T, zh, { isStatic: true }),
    ];
    Composite.add(engine.world, [...w.bodies, ...walls]);
    w.live = true;
    w.last = 0;
    w.t0 = performance.now();
    setLive(true);
    const tick = (now: number) => {
      const s = world.current;
      if (!s.engine) return;
      const dt = s.last ? Math.min(32, now - s.last) : 16;
      s.last = now;
      const t = (now - s.t0) / 1000;
      const k = latest.current.drift * 0.00005 * Math.min(1, t / 2);
      s.bodies.forEach((b, i) => {
        if (s.drag && s.drag.i === i) return;
        const ph = b.plugin.phase as number;
        Body.applyForce(b, b.position, {
          x: Math.sin(t * 0.9 + ph) * k * b.mass,
          y: Math.cos(t * 1.3 + ph * 1.7) * k * b.mass,
        });
      });
      Engine.update(s.engine, dt);
      s.bodies.forEach((b, i) => {
        const el = pillRefs.current[i];
        if (!el) return;
        el.style.setProperty("--x", `${b.position.x.toFixed(1)}px`);
        el.style.setProperty("--y", `${(b.position.y - s.sizes[i].h / 2).toFixed(1)}px`);
      });
      s.raf = requestAnimationFrame(tick);
    };
    w.raf = requestAnimationFrame(tick);
    // posKey / labelsKey: a new layout or new items means a new world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, spread, lift, posKey, labelsKey]);

  const set = React.useCallback(
    (next: boolean) => {
      if (!next) {
        byHover.current = false;
        stopPhysics();
      }
      if (openRef.current === next) return;
      openRef.current = next;
      setOpen(next);
      latest.current.onOpenChange?.(next);
    },
    [stopPhysics]
  );

  // Items changed while open: drop the old bodies; the effect below restarts physics
  // (startPhysics changes with labelsKey) once the pills have re-measured and risen.
  const prevLabels = React.useRef(labelsKey);
  React.useEffect(() => {
    if (prevLabels.current === labelsKey) return;
    prevLabels.current = labelsKey;
    if (openRef.current) stopPhysics();
  }, [labelsKey, stopPhysics]);

  React.useEffect(() => {
    window.clearTimeout(liveTimer.current);
    if (!open || !physics || reduce) {
      stopPhysics();
      return undefined;
    }
    liveTimer.current = window.setTimeout(startPhysics, openDuration + (n - 1) * stagger + 80);
    return () => window.clearTimeout(liveTimer.current);
  }, [open, physics, reduce, openDuration, stagger, n, startPhysics, stopPhysics]);

  // Close on a pointerdown anywhere outside the folder and its pills.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) set(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, set]);

  React.useEffect(
    () => () => {
      window.clearTimeout(popTimer.current);
      stopPhysics();
    },
    [stopPhysics]
  );

  const pick = (item: FolderItem, i: number) => {
    if (item.disabled) return;
    latest.current.onSelect?.(item, i);
    window.clearTimeout(popTimer.current);
    setPopped(i);
    popTimer.current = window.setTimeout(() => setPopped(-1), 320);
    if (closeOnSelect) set(false);
  };

  const pointerAt = (e: React.PointerEvent) => {
    const r = anchorRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  const down = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    const w = world.current;
    if (!w.live || e.button !== 0) return;
    const b = w.bodies[i];
    if (!b) return;
    const p = pointerAt(e);
    w.drag = { i, id: e.pointerId, dx: b.position.x - p.x, dy: b.position.y - p.y, sx: e.clientX, sy: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const move = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    const w = world.current;
    const d = w.drag;
    if (!d || d.i !== i || d.id !== e.pointerId || !w.zone) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= DRAG_MIN) {
      d.moved = true;
      e.currentTarget.setAttribute("data-drag", "");
    }
    if (!d.moved) return;
    const b = w.bodies[i];
    const { w: bw, h: bh } = w.sizes[i];
    const z = w.zone;
    const p = pointerAt(e);
    const x = Math.min(z.right - bw / 2, Math.max(z.left + bw / 2, p.x + d.dx));
    const y = Math.min(z.bottom - bh / 2, Math.max(z.top + bh / 2, p.y + d.dy));
    Body.setVelocity(b, { x: (x - b.position.x) * 0.6, y: (y - b.position.y) * 0.6 });
    Body.setPosition(b, { x, y });
  };
  const up = (e: React.PointerEvent<HTMLButtonElement>, i: number, item: FolderItem) => {
    const w = world.current;
    const d = w.drag;
    if (!d || d.i !== i || d.id !== e.pointerId) return;
    w.drag = null;
    e.currentTarget.removeAttribute("data-drag");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    // A drag never selects; a plain press does.
    if (!d.moved && e.type === "pointerup") pick(item, i);
  };

  const hover = trigger === "hover";
  const fineMouse = (e: React.PointerEvent) =>
    e.pointerType === "mouse" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return (
    <div
      ref={rootRef}
      className={`folder-float${className ? ` ${className}` : ""}`}
      data-open={open ? "" : undefined}
      data-live={live ? "" : undefined}
      data-physics={physics && !reduce ? "" : undefined}
      data-trigger={trigger}
      onPointerEnter={
        hover
          ? (e) => {
              if (!fineMouse(e) || openRef.current) return;
              byHover.current = true;
              set(true);
            }
          : undefined
      }
      onPointerLeave={
        hover
          ? (e) => {
              if (fineMouse(e) && byHover.current && !world.current.drag) set(false);
            }
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && openRef.current) {
          e.stopPropagation();
          set(false);
          triggerRef.current?.focus();
        }
      }}
      style={
        {
          "--ff-w": `${width}px`,
          "--ff-h": `${height}px`,
          "--ff-r": `${radius}px`,
          "--ff-spread": `${spread}px`,
          "--ff-lift": `${lift}px`,
          "--ff-angle": `${flapAngle}deg`,
          "--ff-rest": `${restAngle}deg`,
          "--ff-open": `${openDuration}ms`,
          "--ff-close": `${Math.round(openDuration * 0.6)}ms`,
          "--ff-stagger": `${stagger}ms`,
          "--ff-n": n,
          "--ff-spring": `cubic-bezier(0.34, ${(1 + bounce * 1.9).toFixed(2)}, 0.64, 1)`,
          "--ff-shift": `${shift}px`,
        } as React.CSSProperties
      }
    >
      <div className="folder-float__folder">
        <span className="folder-float__back" aria-hidden="true" />
        <span className="folder-float__paper" aria-hidden="true" />
        <span className="folder-float__front" aria-hidden="true">
          <span className="folder-float__label">{label}</span>
          <span className="folder-float__sub">{sub}</span>
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="folder-float__trigger"
          aria-expanded={open}
          aria-label={`${label}, ${sub}`}
          onClick={() => {
            // A click on a folder the hover opened pins it open; after that, clicks toggle.
            if (openRef.current && byHover.current) {
              byHover.current = false;
              return;
            }
            set(!openRef.current);
          }}
        />
      </div>
      {/* After the folder in the DOM so Tab goes folder button -> pills; z-index keeps the
          original stacking (pills rise behind the paper and the front flap). */}
      <div ref={anchorRef} className="folder-float__items">
        {items.map((item, i) => {
          const p = pos[i];
          return (
            <button
              key={`${item.value}-${i}`}
              ref={(el) => {
                pillRefs.current[i] = el;
              }}
              type="button"
              className="folder-float__item"
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              aria-disabled={item.disabled || undefined}
              data-disabled={item.disabled ? "" : undefined}
              data-pop={popped === i ? "" : undefined}
              style={
                {
                  "--i": i,
                  "--x": `${p.x.toFixed(1)}px`,
                  "--y": `${p.y.toFixed(1)}px`,
                  "--r": `${p.r.toFixed(2)}deg`,
                } as React.CSSProperties
              }
              onPointerDown={(e) => down(e, i)}
              onPointerMove={(e) => move(e, i)}
              onPointerUp={(e) => up(e, i, item)}
              onPointerCancel={(e) => up(e, i, item)}
              onClick={(e) => {
                // Without physics, or from the keyboard (detail 0), a click selects.
                if (!world.current.live || e.detail === 0) pick(item, i);
              }}
            >
              <span className="folder-float__drift">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
