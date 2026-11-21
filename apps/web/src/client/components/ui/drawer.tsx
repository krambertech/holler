import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import * as React from "react";
import { cn } from "@/lib/cn";

// A sheet from the bottom edge: the touch shape of Dialog, Select, Combobox and Dropdown Menu.

type DrawerProps = Omit<DrawerPrimitive.Root.Props, "modal" | "snapPoints" | "swipeDirection">;

function Drawer(props: DrawerProps) {
  return <DrawerPrimitive.Root data-slot="drawer" swipeDirection="down" {...props} />;
}

/** Keeps a focused field above the software keyboard in a drawer that holds a form. */
const DrawerVirtualKeyboardProvider = DrawerPrimitive.VirtualKeyboardProvider;

interface TriggerProps extends Omit<DrawerPrimitive.Trigger.Props, "className"> {
  className?: string | undefined;
}

function DrawerTrigger(props: TriggerProps) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

interface CloseProps extends Omit<DrawerPrimitive.Close.Props, "className"> {
  className?: string | undefined;
}

function DrawerClose(props: CloseProps) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

/**
 * Mirrors Base UI's keyboard inset onto the popup as `--keyboard`. Growth lands at once, because Base
 * UI measures the drawer as the field focuses. Shrinking waits until a tap in flight has delivered
 * its click, since iOS sends the compatibility mouse events and the click after the pointer lifts,
 * and a drawer that drops between them hands the click to whatever slid under the finger. Then the
 * drawer slides down over 250 ms.
 */
function useKeyboardInset(el: HTMLElement | null) {
  React.useEffect(() => {
    const viewport = el?.parentElement;
    if (!el || !viewport) return;
    const TAP_SETTLE_MS = 400;
    let tapAt = Number.NEGATIVE_INFINITY;
    let pending = false;
    let settle = 0;
    let release = 0;
    const clearKeyboardState = () => {
      delete el.dataset.keyboard;
    };
    const sync = () => {
      const next = viewport.style.getPropertyValue("--drawer-keyboard-inset") || "0px";
      const current = el.style.getPropertyValue("--keyboard") || "0px";
      if (next === current) return;
      if (Number.parseFloat(next) > Number.parseFloat(current)) {
        window.clearTimeout(settle);
        clearKeyboardState();
        el.style.setProperty("--keyboard", next);
        return;
      }
      if (performance.now() - tapAt < TAP_SETTLE_MS) {
        if (!pending) {
          pending = true;
          window.clearTimeout(release);
          release = window.setTimeout(flush, TAP_SETTLE_MS);
        }
        return;
      }
      el.dataset.keyboard = "closing";
      el.style.setProperty("--keyboard", next);
      window.clearTimeout(settle);
      settle = window.setTimeout(clearKeyboardState, 300);
    };
    const flush = () => {
      if (!pending) return;
      pending = false;
      tapAt = Number.NEGATIVE_INFINITY;
      sync();
    };
    const observer = new MutationObserver(sync);
    observer.observe(viewport, { attributes: true, attributeFilter: ["style"] });
    const down = () => {
      tapAt = performance.now();
    };
    // The click is the last event a tap produces; the drawer may move once it has been delivered.
    const click = () => {
      if (pending) window.setTimeout(flush, 0);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", click, true);
    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
      window.clearTimeout(release);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", click, true);
    };
  }, [el]);
}

/**
 * Raises the software keyboard inside the tap that opens a drawer holding one field. iOS raises the
 * keyboard only for focus inside a gesture, and Base UI focuses the field after the drawer mounts,
 * so the field would show a caret and no keys. A hidden input takes focus during the tap, the
 * keyboard rises with the drawer, and once the drawer has settled focus moves to the field, so Base
 * UI measures a drawer at rest. Render `input` beside the trigger, inside the drawer root.
 */
function useKeyboardHandoff(field: () => HTMLElement | null | undefined) {
  const warm = React.useRef<HTMLInputElement>(null);
  const warmUp = React.useCallback(() => warm.current?.focus({ preventScroll: true }), []);
  // A keyboard has no software keyboard to raise, and its next keystrokes belong to the field.
  const initialFocus = React.useCallback(
    (openType: string) =>
      openType === "touch" || openType === "pen" ? (warm.current ?? true) : (field() ?? true),
    [field],
  );
  const handOff = React.useCallback(
    (open: boolean) => {
      if (open) field()?.focus({ preventScroll: true });
    },
    [field],
  );
  const input = (
    <input
      ref={warm}
      aria-hidden="true"
      tabIndex={-1}
      autoComplete="off"
      className="pointer-events-none absolute h-px w-px opacity-0"
    />
  );
  return { input, warmUp, initialFocus, handOff };
}

interface ContentProps extends Omit<DrawerPrimitive.Popup.Props, "className"> {
  className?: string | undefined;
}

/**
 * The portal holds the dialog layer, so a list opened from inside the sheet, which Base UI portals
 * into it, rises above it. The scrim renders for a nested sheet too, so it dims the sheet it rose
 * from. The sheet rises over 250 ms; a flick leaves faster than a slow drag.
 */
function DrawerContent({ className, children, ...props }: ContentProps) {
  const [popupEl, setPopupEl] = React.useState<HTMLElement | null>(null);
  useKeyboardInset(popupEl);

  return (
    <DrawerPrimitive.Portal data-slot="drawer-portal" className="relative z-(--z-dialog)">
      <DrawerPrimitive.Backdrop
        data-slot="drawer-overlay"
        forceRender
        className="fixed inset-0 min-h-dvh bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-250 ease-(--ease-out) select-none data-ending-style:pointer-events-none data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*250ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute"
      />
      <DrawerPrimitive.Viewport data-slot="drawer-viewport" className="fixed inset-0 select-none">
        <DrawerPrimitive.Popup
          ref={setPopupEl}
          data-slot="drawer-popup"
          className={cn(
            "group/drawer-popup floating fixed inset-x-0 bottom-0 flex h-(--drawer-height,auto) min-h-0 origin-bottom transform-[translate3d(0,var(--drawer-swipe-movement-y,0px),0)] flex-col rounded-t-plate text-ink transition-[transform,opacity] duration-250 ease-(--ease-out) will-change-transform outline-none select-none [interpolate-size:allow-keywords]",
            // Keyboard: the software keyboard's height becomes bottom padding, so the foot of the
            // drawer, and any footer pinned to it, sits above the keys; the safe area is under them.
            // Only the closing slides, so a rising keyboard never covers the field Base UI aligns.
            "pb-[max(env(safe-area-inset-bottom),var(--keyboard,0px))] data-[keyboard=closing]:transition-[transform,opacity,padding]",
            // Nested: the drawer behind keeps its height and its content; the nested scrim dims it.
            "data-nested-drawer-open:overflow-hidden",
            // Bleed: paint past the bottom edge, so an overscroll never shows the page under the drawer.
            "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-plate",
            // Sizing: edge to edge on a phone, no wider than a short form on a tablet, and never
            // taller than the room above the keyboard.
            "max-h-[calc(min(85dvh,100dvh-var(--keyboard,0px)-env(safe-area-inset-top)-1rem)+var(--keyboard,0px))] sm:mx-auto sm:max-w-md",
            "[--closed:translate3d(0,calc(100%+2px),0)] data-starting-style:transform-(--closed) data-ending-style:transform-(--closed) data-ending-style:opacity-[0.9999] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*250ms)] data-swiping:duration-0 data-nested-drawer-swiping:duration-0",
            className,
          )}
          {...props}
        >
          <SwipeHandle />
          <DrawerPrimitive.Content
            data-slot="drawer-content"
            // The scroll padding keeps a field that Tab scrolls to clear of the pinned title and
            // actions. Base UI's keyboard slack is overridden because the popup's padding already
            // clears the keys, and sticky actions rise by any padding here, over the first field.
            className="flex min-h-0 flex-1 scroll-pt-12 scroll-pb-24 flex-col overflow-y-auto overscroll-contain rounded-[inherit] pb-0! select-text group-data-swiping/drawer-popup:select-none"
          >
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

/** The grip at the top of the sheet, hidden while a nested sheet covers it. */
function SwipeHandle() {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className="relative flex h-4 w-full shrink-0 cursor-grab items-end justify-center transition-opacity duration-200 group-data-nested-drawer-open/drawer-popup:opacity-0 group-data-nested-drawer-swiping/drawer-popup:opacity-100 after:block after:h-1 after:w-9 after:shrink-0 after:rounded-full after:bg-edge-2 active:cursor-grabbing"
    />
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex shrink-0 flex-col gap-1 p-4 pb-0 text-start", className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

interface TitleProps extends Omit<DrawerPrimitive.Title.Props, "className"> {
  className?: string | undefined;
}

function DrawerTitle({ className, ...props }: TitleProps) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-lg font-normal text-ink", className)}
      {...props}
    />
  );
}

interface DescriptionProps extends Omit<DrawerPrimitive.Description.Props, "className"> {
  className?: string | undefined;
}

function DrawerDescription({ className, ...props }: DescriptionProps) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-base text-ink-2", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerVirtualKeyboardProvider,
  useKeyboardHandoff,
};
