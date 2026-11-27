import { EyeOff } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { PlateStrip } from "@/components/ui/plate";
import { cn } from "@/lib/cn";
import { markdown } from "@/lib/markdown";

export interface RespondAbout {
  title: string;
  senderName: string;
  senderSlackUserId: string;
  senderAvatarUrl: string | null;
}

interface Props extends ComponentProps<"header"> {
  holler: RespondAbout;
  description?: string | undefined;
  closes?: ReactNode | undefined;
  compact?: boolean | undefined;
}

function RespondHeader({
  holler,
  description,
  closes,
  compact = false,
  className,
  ...props
}: Props) {
  const Title = compact ? "p" : "h1";
  return (
    <header
      data-slot="respond-header"
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-6 pt-7 pb-6" : "px-6 pt-8 pb-7 sm:px-12 sm:pt-11 sm:pb-9",
        className,
      )}
      {...props}
    >
      <Avatar
        size={compact ? "lg" : "xl"}
        name={holler.senderName}
        seed={holler.senderSlackUserId}
        src={holler.senderAvatarUrl}
      />
      <p className="mt-3 text-ink-2 text-sm">
        <span className="text-ink">{holler.senderName}</span> sent you a Holler
      </p>
      <Title
        className={cn(
          "mt-1 text-balance tracking-title",
          compact ? "text-lg" : "text-3xl sm:text-4xl",
        )}
      >
        {holler.title}
      </Title>
      {description?.trim() && (
        <div className="mt-3 flex max-w-[52ch] flex-col gap-3 text-pretty text-ink-2">
          {markdown(description)}
        </div>
      )}
      {closes && <p className="mt-3 text-muted text-sm">{closes}</p>}
    </header>
  );
}

interface AnonymousProps extends ComponentProps<"div"> {
  senderName: string;
}

function AnonymousNote({ senderName, className, ...props }: AnonymousProps) {
  return (
    <PlateStrip
      data-slot="anonymous-note"
      className={cn("flex-nowrap items-start justify-center gap-2 text-sm sm:px-12", className)}
      {...props}
    >
      <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <p className="text-pretty">
        Anonymous. {senderName} sees how many people answered, never who said what.
      </p>
    </PlateStrip>
  );
}

export { AnonymousNote, RespondHeader };
