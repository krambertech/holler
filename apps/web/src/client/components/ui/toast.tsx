import { type ToastManagerAddOptions, Toast as ToastPrimitive } from "@base-ui/react/toast";
import { OctagonXIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const manager = ToastPrimitive.createToastManager();

type Tone = "neutral" | "danger";

interface ToastOptions extends Omit<ToastManagerAddOptions<object>, "type" | "priority"> {
  /** "danger" is announced at once and carries an icon; every other toast waits for the reader to pause. */
  tone?: Tone | undefined;
}

/** Long enough to reach Undo with a screen reader or a switch; a toast without an action keeps Base UI's 5 s. */
const ACTION_TIMEOUT = 10_000;

const toast = {
  add: ({ tone = "neutral", ...options }: ToastOptions) =>
    manager.add({
      ...(options.actionProps ? { timeout: ACTION_TIMEOUT } : {}),
      ...options,
      // Base UI carries the tone as the toast's type, which `ToastList` reads back.
      type: tone,
      priority: tone === "danger" ? "high" : "low",
    }),
  close: manager.close,
};

interface Styled {
  className?: string | undefined;
}

function ToastPortal(props: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

interface ViewportProps extends Omit<ToastPrimitive.Viewport.Props, "className">, Styled {}

function ToastViewport({ className, ...props }: ViewportProps) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        // A toast travels the inset too, so it enters and leaves past the screen's edge.
        "pointer-events-none fixed inset-x-4 bottom-(--toast-inset) z-(--z-toast) mx-auto w-auto max-w-sm outline-none [--toast-inset:calc(env(safe-area-inset-bottom)+1rem)] sm:end-4 sm:start-auto sm:mx-0 sm:w-full",
        className,
      )}
      {...props}
    />
  );
}

interface ToastProps extends Omit<ToastPrimitive.Root.Props, "className">, Styled {}

/** Rises over 250 ms and leaves in 200. Newer toasts stack in front inside the toast layer. */
function Toast({ className, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "group/toast pointer-events-auto absolute end-0 bottom-0 z-[calc(100-var(--toast-index))] w-full origin-bottom rounded-control bg-ink text-canvas shadow-float will-change-transform select-none",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] transition-[transform,opacity,height] duration-250 ease-(--ease-out) data-ending-style:duration-200",
        "after:absolute after:start-0 after:top-full after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(calc(150%+var(--toast-inset,0px)))]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(calc(150%+var(--toast-inset,0px)))]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%+var(--toast-inset,0px)))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%+var(--toast-inset,0px)))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className,
      )}
      {...props}
    />
  );
}

interface ContentProps extends Omit<ToastPrimitive.Content.Props, "className">, Styled {}

function ToastContent({ className, ...props }: ContentProps) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex h-full items-center gap-2.5 overflow-hidden py-2.5 ps-4 pe-2 transition-opacity duration-250 ease-(--ease-out) data-behind:opacity-0 data-expanded:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

interface TitleProps extends Omit<ToastPrimitive.Title.Props, "className">, Styled {}

function ToastTitle({ className, ...props }: TitleProps) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn(
        "line-clamp-4 text-sm leading-snug text-pretty [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

interface DescriptionProps extends Omit<ToastPrimitive.Description.Props, "className">, Styled {}

function ToastDescription({ className, ...props }: DescriptionProps) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-canvas/70", className)}
      {...props}
    />
  );
}

interface ActionProps extends Omit<ToastPrimitive.Action.Props, "className">, Styled {}

function ToastAction({ className, ...props }: ActionProps) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        "relative shrink-0 rounded-sm px-2.5 py-1.5 text-sm font-normal text-toast-action transition-[background-color,scale] duration-150 ease-(--ease-out) before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hoverable:hover:bg-canvas/10 focus-visible:outline-canvas active:scale-[0.97] motion-reduce:active:scale-100",
        className,
      )}
      {...props}
    />
  );
}

interface CloseProps extends Omit<ToastPrimitive.Close.Props, "className">, Styled {}

function ToastClose({ className, children, ...props }: CloseProps) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      className={cn(
        "relative grid size-7 shrink-0 place-items-center rounded-sm text-canvas/60 transition-colors duration-150 after:absolute after:-inset-2 after:content-[''] hoverable:hover:bg-canvas/10 hoverable:hover:text-canvas focus-visible:outline-canvas [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ tone }: { tone: string | undefined }) {
  if (tone !== "danger") return null;

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      <OctagonXIcon aria-hidden="true" />
    </span>
  );
}

function ToastList({
  closeLabel,
  className,
}: {
  closeLabel: string;
  className?: string | undefined;
}) {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem} className={className}>
      <ToastContent>
        <ToastIcon tone={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose aria-label={closeLabel} />
      </ToastContent>
    </Toast>
  ));
}

function Toaster({
  children,
  "aria-label": label,
  closeLabel,
  viewportClassName,
  toastManager = manager,
  ...props
}: ToastPrimitive.Provider.Props & {
  /** Names the region the toasts are announced from. */
  "aria-label": string;
  closeLabel: string;
  viewportClassName?: string | undefined;
}) {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport aria-label={label} className={viewportClassName}>
          <ToastList closeLabel={closeLabel} />
        </ToastViewport>
      </ToastPortal>
    </ToastPrimitive.Provider>
  );
}

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  Toaster,
  ToastList,
  ToastPortal,
  ToastTitle,
  ToastViewport,
  toast,
};
