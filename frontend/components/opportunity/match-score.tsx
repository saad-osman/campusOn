import { cn } from "@/lib/utils";

function tone(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-sky-600 dark:text-sky-400";
  if (score >= 35) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

/** Circular 0-100 match score (Feature 2). */
export function MatchScore({ score, size = 48, className }: { score: number; size?: number; className?: string }) {
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
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-foreground"
        style={{ fontSize: size * 0.3 }}
      >
        {score}
      </span>
    </div>
  );
}
