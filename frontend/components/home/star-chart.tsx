import { LodestarStar } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/*
 * Decorative star chart: the dot grid (.star-chart in globals.css) plus the gold
 * guiding star, centred exactly on a grid dot. The grid is tiled from the
 * top-right corner, so dots sit at (right 14 + 28n, top 14 + 28m) at any width.
 *
 *   hero   (lg+): visible across the right half, fading out left-to-right behind
 *                the text column and gently at the bottom. Star at dot n=2, m=2, above and
 *                right of the preview's main card (which sits 120px from the edge).
 *   panel (<lg):  sits behind the preview block below the CTA. Star at dot n=1, m=0, in the
 *                block's top padding, clear of the card.
 */
const VARIANTS = {
  hero: { mask: "star-chart-mask-hero", star: "right-[70px] top-[70px] h-8" },
  panel: { mask: "star-chart-mask-panel", star: "right-[42px] top-[14px] h-7" },
} as const;

export function StarChart({ variant, className }: { variant: keyof typeof VARIANTS; className?: string }) {
  const v = VARIANTS[variant];
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-xl", className)}>
      <div className={cn("star-chart absolute inset-0", v.mask)} />
      <LodestarStar className={cn("star-twinkle absolute translate-x-1/2 -translate-y-1/2", v.star)} />
    </div>
  );
}
