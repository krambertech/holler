import { ARRIVE_POP, ARRIVE_RISE, ARRIVE_RING, ARRIVE_SPARK, CHOICE_FADE } from "@holler/design";
import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Plate, PlateRow } from "@/components/ui/plate";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

type Tone = "answered" | "closed" | "neutral";

const tones: Record<Tone, string> = {
  answered: "bg-answered text-answered-ink",
  closed: "bg-closed text-closed-ink",
  neutral: "bg-tint text-tint-ink",
};

const sparks: Record<Tone, readonly string[]> = {
  answered: ["bg-answered-dot", "bg-pink"],
  closed: ["bg-closed-dot"],
  neutral: ["bg-pink"],
};

interface About {
  title: string;
  senderName: string;
  senderSlackUserId: string;
  senderAvatarUrl: string | null;
}

interface Props extends Omit<ComponentProps<"div">, "title"> {
  title: string;
  description?: ReactNode | undefined;
  icon: ReactNode;
  tone?: Tone | undefined;
  holler?: About | undefined;
  action?: ReactNode | undefined;
  arrive?: boolean | undefined;
}

const sparkCount = 10;

function Glyph({
  icon,
  tone,
  play,
  reduce,
}: {
  icon: ReactNode;
  tone: Tone;
  play: boolean;
  reduce: boolean;
}) {
  const moving = play && !reduce;
  return (
    <span aria-hidden="true" className="relative grid size-14 place-items-center">
      {moving && (
        <motion.span
          className={cn("absolute inset-0 rounded-full", tones[tone])}
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={ARRIVE_RING}
        />
      )}
      {moving &&
        Array.from({ length: sparkCount }, (_, index) => {
          const angle = (index / sparkCount) * Math.PI * 2 - Math.PI / 2;
          const reach = index % 2 === 0 ? 50 : 40;
          const palette = sparks[tone];
          return (
            <motion.span
              key={angle}
              className={cn(
                "absolute start-1/2 top-1/2 -ms-1 -mt-1 size-2 rounded-full",
                palette[index % palette.length],
              )}
              initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
              animate={{
                x: Math.cos(angle) * reach,
                y: Math.sin(angle) * reach,
                scale: [0.4, 1, 0.2],
                opacity: [0, 1, 0],
              }}
              transition={ARRIVE_SPARK}
            />
          );
        })}
      <motion.span
        className={cn(
          "relative grid size-14 place-items-center rounded-full [&_svg]:size-6",
          tones[tone],
        )}
        initial={play ? (reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }) : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? CHOICE_FADE : ARRIVE_POP}
      >
        <motion.span
          className="grid place-items-center"
          initial={play ? (reduce ? { opacity: 0 } : { clipPath: "inset(0 100% 0 0)" }) : false}
          animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
          transition={reduce ? CHOICE_FADE : { ...ARRIVE_RISE, delay: 0.18 }}
        >
          {icon}
        </motion.span>
      </motion.span>
    </span>
  );
}

function RespondState({
  title,
  description,
  icon,
  tone = "neutral",
  holler,
  action,
  arrive = false,
  className,
  children,
  ...props
}: Props) {
  const reduce = useReduceMotion();
  const rise = (step: number) =>
    arrive
      ? {
          initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: reduce ? CHOICE_FADE : { ...ARRIVE_RISE, delay: 0.22 + step * 0.06 },
        }
      : { initial: false as const };
  return (
    <Plate data-slot="respond-state" className={className} {...props}>
      <PlateRow className="flex flex-col items-center px-6 pt-10 pb-9 text-center sm:px-10">
        <Glyph icon={icon} tone={tone} play={arrive} reduce={reduce} />
        <motion.h1 className="mt-5 text-balance text-3xl tracking-title" {...rise(0)}>
          {title}
        </motion.h1>
        {description && (
          <motion.div
            className="mt-2 flex max-w-[46ch] flex-col gap-1 text-pretty text-ink-2"
            {...rise(1)}
          >
            {description}
          </motion.div>
        )}
        {holler && (
          <motion.p
            className="mt-6 inline-flex max-w-full items-center gap-2.5 rounded-full bg-canvas py-1.5 ps-1.5 pe-4 text-sm"
            {...rise(2)}
          >
            <Avatar
              size="md"
              name={holler.senderName}
              seed={holler.senderSlackUserId}
              src={holler.senderAvatarUrl}
            />
            <span className="min-w-0 truncate">
              <span className="text-ink">{holler.title}</span>
              <span className="text-muted"> from {holler.senderName}</span>
            </span>
          </motion.p>
        )}
        {action && (
          <motion.div className="mt-7 flex w-full justify-center" {...rise(3)}>
            {action}
          </motion.div>
        )}
      </PlateRow>
      {children}
    </Plate>
  );
}

export { RespondState };
