"use client";

/*
 * ScrollReveal, ported from React Bits (https://reactbits.dev) to TypeScript.
 * Fixes: cleanup reverts only this instance's tweens and triggers (gsap.context), the
 * words render straight inside the chosen element (no <p> inside an <h2>), the element
 * inherits the page's heading styles, the full text is the accessible name, and
 * reduced motion renders plain text with no triggers. Home page only (DESIGN.md).
 */
import * as React from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotionNow, usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

type ScrollRevealProps = {
  children: string;
  as?: "h2" | "h3" | "p";
  id?: string;
  className?: string;
  scrollContainerRef?: React.RefObject<HTMLElement>;
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
  rotationEnd?: string;
  wordAnimationEnd?: string;
};

export function ScrollReveal({
  children,
  as: Tag = "h2",
  id,
  className,
  scrollContainerRef,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  rotationEnd = "bottom bottom",
  wordAnimationEnd = "bottom bottom",
}: ScrollRevealProps) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLElement | null>(null);

  const words = React.useMemo(
    () =>
      children.split(/(\s+)/).map((word, index) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <span className="word" key={index} aria-hidden>
            {word}
          </span>
        )
      ),
    [children]
  );

  React.useEffect(() => {
    const el = ref.current;
    // Checked live as well: the hook is false on the first render, and creating then
    // reverting a trigger that is already in view can leave its from-state behind.
    if (!el || reduced || prefersReducedMotionNow()) return;
    const scroller = scrollContainerRef?.current ?? window;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { transformOrigin: "0% 50%", rotate: baseRotation },
        { ease: "none", rotate: 0, scrollTrigger: { trigger: el, scroller, start: "top bottom", end: rotationEnd, scrub: true } }
      );
      const wordEls = el.querySelectorAll(".word");
      const wordTrigger = { trigger: el, scroller, start: "top bottom-=20%", end: wordAnimationEnd, scrub: true };
      gsap.fromTo(
        wordEls,
        { opacity: baseOpacity, willChange: "opacity" },
        { ease: "none", opacity: 1, stagger: 0.05, scrollTrigger: wordTrigger }
      );
      if (enableBlur) {
        gsap.fromTo(
          wordEls,
          { filter: `blur(${blurStrength}px)` },
          { ease: "none", filter: "blur(0px)", stagger: 0.05, scrollTrigger: { ...wordTrigger } }
        );
      }
    }, ref);
    return () => ctx.revert();
  }, [reduced, scrollContainerRef, enableBlur, baseRotation, baseOpacity, rotationEnd, wordAnimationEnd, blurStrength]);

  if (reduced) {
    return (
      <Tag id={id} className={className}>
        {children}
      </Tag>
    );
  }
  return (
    <Tag ref={ref as React.Ref<never>} id={id} className={cn("scroll-reveal", className)} aria-label={children}>
      {words}
    </Tag>
  );
}
