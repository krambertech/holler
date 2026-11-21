import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Plate, PlateRow } from "@/components/ui/plate";
import { cn } from "@/lib/cn";

type Tone = "answered" | "closed" | "neutral";

const tones: Record<Tone, string> = {
  answered: "bg-answered text-answered-ink",
  closed: "bg-closed text-closed-ink",
  neutral: "bg-tint text-tint-ink",
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
}

function RespondState({
  title,
  description,
  icon,
  tone = "neutral",
  holler,
  className,
  children,
  ...props
}: Props) {
  return (
    <Plate data-slot="respond-state" className={className} {...props}>
      <PlateRow className="flex flex-col items-center px-6 pt-10 pb-9 text-center sm:px-10">
        <span
          aria-hidden="true"
          className={cn("grid size-14 place-items-center rounded-full [&_svg]:size-6", tones[tone])}
        >
          {icon}
        </span>
        <h1 className="mt-5 text-balance text-3xl tracking-title">{title}</h1>
        {description && (
          <div className="mt-2 flex max-w-[46ch] flex-col gap-1 text-pretty text-ink-2">
            {description}
          </div>
        )}
        {holler && (
          <p className="mt-6 inline-flex max-w-full items-center gap-2.5 rounded-full bg-canvas py-1.5 ps-1.5 pe-4 text-sm">
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
          </p>
        )}
      </PlateRow>
      {children}
    </Plate>
  );
}

export { RespondState };
