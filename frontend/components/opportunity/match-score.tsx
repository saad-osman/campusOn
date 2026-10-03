"use client";

import { useCountUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

function tone(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-sky-600 dark:text-sky-400";
  if (score >= 35) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

/**
 * Circular 0-100 match score (Feature 2). Counts up on mount (`animate`, after `delay` ms);
 * the colour and the accessible label always use the final score.
 */
export function MatchScore({
  score,
  size = 48,
  className,
  animate = true,
  delay = 0,
}: {
  score: number;
  size?: number;
  className?: string;
  animate?: boolean;
  delay?: number;
}) {
  const shown = useCountUp(score, { duration: 1000, delay, enabled: animate });
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative shrink-0", tone(score), className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Match score ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums tracking-tight text-foreground"
        style={{ fontSize: size * 0.3 }}
      >
        {Math.round(shown)}
      </span>
    </div>
  );
}
