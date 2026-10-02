import * as React from "react";
import { cn } from "@/lib/utils";

/** Page/section header icon: a size-5 gold-toned Lucide icon in a size-10 accent tile. */
export function IconTile({ icon: Icon, children, className }: {
  icon?: React.ElementType;
  /** Custom content instead of an icon (e.g. a user-chosen emoji). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border border-honor/20 bg-accent", className)}
      aria-hidden
    >
      {children ?? (Icon && <Icon className="size-5 text-honor" />)}
    </span>
  );
}
