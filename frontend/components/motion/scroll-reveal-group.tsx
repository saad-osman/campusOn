"use client";

/*
 * Reveals the elements matching `selector` inside it, in sequence, tied to scroll
 * (scrub: plays forward scrolling down, reverses scrolling up). Wrap a whole
 * <BentoGrid> and pass ":scope > div > *" so nothing sits between the grid and its
 * cells. Home page only; reduced motion creates no triggers.
 */
import * as React from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotionNow, usePrefersReducedMotion } from "@/lib/motion";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function ScrollRevealGroup({
  selector,
  className,
  children,
}: {
  selector: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    // Checked live as well: the hook is false on the first render, and creating then
    // reverting a trigger that is already in view can leave its from-state behind.
    if (!el || reduced || prefersReducedMotionNow()) return;
    const ctx = gsap.context(() => {
      const items = el.querySelectorAll(selector);
      if (!items.length) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 16, filter: "blur(4px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          ease: "none",
          stagger: 0.12,
          scrollTrigger: { trigger: el, start: "top bottom-=10%", end: "bottom bottom", scrub: true },
        }
      );
    }, ref);
    return () => ctx.revert();
  }, [reduced, selector]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
