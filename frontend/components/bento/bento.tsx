import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * Bento grid: 12 columns on desktop (spans 3/4/6/8/12 only, so edges align),
 * 6 on tablet, 1 on mobile. Every cell uses the same padding (p-5) and
 * left-aligned content. "hero" cells are navy in both modes (see --hero in
 * globals.css); use at most 1-2 per page.
 */

export type BentoSpan = 3 | 4 | 6 | 8 | 12;

// Static class maps so Tailwind can see every class at build time.
const LG_SPAN: Record<BentoSpan, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};
// On the 6-column tablet grid quarter-width cells pair up; everything else goes full width.
const MD_SPAN: Record<BentoSpan, string> = {
  3: "md:col-span-3",
  4: "md:col-span-6",
  6: "md:col-span-6",
  8: "md:col-span-6",
  12: "md:col-span-6",
};
const ROWS = { 1: "", 2: "lg:row-span-2" } as const;
// On phones cells stack in one column; this lets the most important ones lead.
// (Tablet keeps source order so half-width cells stay paired.)
const ORDER = { first: "max-md:-order-1", default: "", late: "max-md:order-1", last: "max-md:order-2" } as const;

const SURFACE = {
  standard: "border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
  hero: "border border-hero bg-hero text-hero-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:border-gold/30",
} as const;

export function BentoGrid({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12 lg:auto-rows-[minmax(140px,auto)]", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type CellProps = {
  span?: BentoSpan;
  rows?: 1 | 2;
  variant?: keyof typeof SURFACE;
  order?: keyof typeof ORDER;
  /** Makes the whole cell a link. Only for cells with no other links inside. */
  href?: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
};

export function BentoCell({ span = 6, rows = 1, variant = "standard", order = "default", href, label, className, children }: CellProps) {
  const classes = cn(
    "flex min-w-0 flex-col gap-3 rounded-xl p-5 text-left",
    SURFACE[variant],
    MD_SPAN[span],
    LG_SPAN[span],
    ROWS[rows],
    ORDER[order],
    href &&
      "transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    href && variant === "standard" && "hover:border-foreground/20 hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)]",
    href && variant === "hero" && "hover:shadow-[0_2px_10px_rgb(0_0_0/0.18)] dark:hover:border-gold/60",
    className
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <section aria-label={label} className={classes}>
      {children}
    </section>
  );
}

/** Cell heading row: small icon, serif title, optional action link on the right. */
export function BentoHeader({ icon: Icon, title, action, as: Tag = "h2" }: {
  icon?: React.ElementType;
  title: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <header className="flex items-center justify-between gap-2">
      <Tag className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
        {title}
      </Tag>
      {action}
    </header>
  );
}

/** "View all"-style link for a cell header. */
export function BentoAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
      {children}
    </Link>
  );
}
