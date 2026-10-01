import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, formatDate } from "@/lib/format";

/** Deadline countdown, red under 7 days (Feature 9). */
export function DeadlineBadge({
  deadline,
  deadlineText,
  className,
}: {
  deadline: string | null;
  deadlineText?: string | null;
  className?: string;
}) {
  const days = daysUntil(deadline);
  let label: string;
  let tone = "text-muted-foreground";
  if (days === null) {
    label = deadlineText || "Rolling deadline";
  } else if (days < 0) {
    label = `Closed ${formatDate(deadline)}`;
  } else if (days === 0) {
    label = "Closes today";
    tone = "text-rose-600 dark:text-rose-400 font-medium";
  } else {
    label = `${days} day${days === 1 ? "" : "s"} left`;
    if (days < 7) tone = "text-rose-600 dark:text-rose-400 font-medium";
    else if (days < 21) tone = "text-amber-700 dark:text-amber-400";
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone, className)} title={formatDate(deadline)}>
      <CalendarClock className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
