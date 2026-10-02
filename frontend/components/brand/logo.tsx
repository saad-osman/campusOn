import { cn } from "@/lib/utils";

/**
 * The Lodestar mark: a gold four-pointed star on a navy rounded square.
 * Same geometry as app/icon.svg (the favicon/app-icon source), so the logo
 * and the browser-tab icon always match.
 */
export function LodestarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-6 shrink-0", className)} aria-hidden focusable="false">
      <rect width="64" height="64" rx="14" fill="#1b345e" />
      {/* In dark mode the navy tile sits on navy; a hairline keeps its edge visible. */}
      <rect width="63" height="63" x="0.5" y="0.5" rx="13.5" fill="none" className="stroke-transparent dark:stroke-white/15" />
      <path d="M32 6 L40 24 L58 32 L40 40 L32 58 L24 40 L6 32 L24 24 Z" fill="#e1b75c" />
    </svg>
  );
}

export function LodestarWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LodestarMark />
      <span className="font-heading text-lg font-semibold tracking-tight">Lodestar</span>
    </span>
  );
}
