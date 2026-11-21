import { mark } from "@holler/design";
import { cn } from "@/lib/cn";

/** The calling h in its plum square. The same shape is the app icon and the Slack avatar. */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  const small = size < 24;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center bg-plum", className)}
      style={{ width: size, height: size, borderRadius: size * mark.cornerRadius }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox={mark.viewBox}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={mark.letter}
          stroke="white"
          strokeWidth={small ? mark.smallLetterStroke : mark.letterStroke}
        />
        <path
          d={mark.sound}
          className="stroke-soft-pink"
          strokeWidth={small ? mark.smallSoundStroke : mark.soundStroke}
        />
      </svg>
    </span>
  );
}

/** Mark and lowercase wordmark. The only place weight 600 appears. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={size} />
      <span
        className="font-semibold tracking-[-0.02em]"
        style={{ fontSize: Math.round(size * 0.6) }}
      >
        holler
      </span>
    </span>
  );
}
