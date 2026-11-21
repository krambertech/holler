import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import * as React from "react";
import { cn } from "@/lib/cn";
import { type Shape, useOverlayShape } from "@/lib/device";
import { useControllableState } from "@/lib/use-controllable-state";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerVirtualKeyboardProvider,
} from "./drawer";

/*
 * Centred on a desktop, a sheet from the bottom edge on a touch device, for a question and a form
 * alike. Every part below renders both shapes, so a call site never asks which machine it is on.
 * There is no corner close button: a dialog ends in explicit actions.
 */

const DialogShapeContext = React.createContext<Shape | null>(null);

function useDialogShape(part: string) {
  const shape = React.useContext(DialogShapeContext);
  if (!shape) throw new Error(`${part} must be used within a Dialog.`);
  return shape;
}

type OpenChangeDetails =
  | DialogPrimitive.Root.ChangeEventDetails
  | DrawerPrimitive.Root.ChangeEventDetails;

function Dialog({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean, details?: OpenChangeDetails) => void) | undefined;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useControllableState<boolean, [details?: OpenChangeDetails]>({
    value: controlled,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const shape = useOverlayShape(open);
  return (
    <DialogShapeContext.Provider value={shape}>
      {shape === "desktop" ? (
        <DialogPrimitive.Root data-slot="dialog" open={open} onOpenChange={setOpen}>
          {children}
        </DialogPrimitive.Root>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          {/* Keeps a focused field above the software keyboard when the dialog holds a form. */}
          <DrawerVirtualKeyboardProvider>{children}</DrawerVirtualKeyboardProvider>
        </Drawer>
      )}
    </DialogShapeContext.Provider>
  );
}

interface ButtonPartProps extends React.ComponentProps<"button"> {
  /** The control, such as `<Button … />`; a plain button when left out. */
  render?: React.ReactElement | undefined;
}

function DialogTrigger(props: ButtonPartProps) {
  return useDialogShape("DialogTrigger") === "desktop" ? (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
  ) : (
    <DrawerTrigger data-slot="dialog-trigger" {...props} />
  );
}

function DialogClose(props: ButtonPartProps) {
  return useDialogShape("DialogClose") === "desktop" ? (
    <DialogPrimitive.Close data-slot="dialog-close" {...props} />
  ) : (
    <DrawerClose data-slot="dialog-close" {...props} />
  );
}

/** The centred dialog's widths: a question, a short form, a longer form. */
const sizes = {
  sm: "w-[min(92vw,420px)]",
  md: "w-[min(92vw,480px)]",
  lg: "w-[min(92vw,560px)]",
  xl: "w-[min(92vw,800px)]",
};

interface ContentProps extends React.ComponentProps<"div"> {
  /** The centred dialog's width. The sheet sizes itself. */
  size?: keyof typeof sizes | undefined;
  /** Dresses the centred dialog. The sheet ignores it. */
  className?: string | undefined;
  /** Where focus lands on opening, when the first control is not the safe one. */
  initialFocus?: DialogPrimitive.Popup.Props["initialFocus"];
  /** Where focus lands on closing, when the control that opened it is gone. */
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"];
}

/** Other props land on the element holding the dialog role, in either shape. */
function DialogContent({ className, size = "sm", children, ...props }: ContentProps) {
  const shape = useDialogShape("DialogContent");
  if (shape === "touch") {
    return (
      <DrawerContent {...props}>
        {/* One column that never grows past the sheet, so a long unbroken value truncates instead. */}
        <div
          data-slot="dialog-content"
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-2 pb-5"
        >
          {children}
        </div>
      </DrawerContent>
    );
  }
  return (
    // The portal holds the dialog layer, so a list opened from inside the dialog, which Base UI
    // portals into it, rises above it.
    <DialogPrimitive.Portal data-slot="dialog-portal" className="relative z-(--z-dialog)">
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 bg-scrim transition-opacity duration-200 ease-(--ease-out) data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-140"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        {...props}
        className={cn(
          sizes[size],
          // A 6 px rise over 200 ms, leaving in 140.
          "floating fixed inset-0 m-auto grid h-fit max-h-[85dvh] scroll-pb-24 gap-4 overflow-y-auto overscroll-contain rounded-plate p-5 text-ink outline-none transition-[opacity,translate,scale] duration-200 ease-(--ease-out) data-starting-style:translate-y-1.5 data-starting-style:scale-99 data-starting-style:opacity-0 data-ending-style:translate-y-1.5 data-ending-style:scale-99 data-ending-style:opacity-0 data-ending-style:duration-140 motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-ending-style:scale-100",
          className,
        )}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return useDialogShape("DialogHeader") === "desktop" ? (
    <div data-slot="dialog-header" className={cn("grid gap-2", className)} {...props} />
  ) : (
    <DrawerHeader data-slot="dialog-header" className={cn("gap-2 p-0", className)} {...props} />
  );
}

/** Actions, primary last: a row on a desktop, stacked full width with the primary on top on touch. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return useDialogShape("DialogFooter") === "desktop" ? (
    <div
      data-slot="dialog-footer"
      className={cn("mt-1 flex flex-row justify-end gap-2", className)}
      {...props}
    />
  ) : (
    <DrawerFooter
      data-slot="dialog-footer"
      className={cn("mt-1 flex-col-reverse p-0 *:h-11 *:w-full", className)}
      {...props}
    />
  );
}

interface TitleProps extends Omit<DialogPrimitive.Title.Props, "className"> {
  className?: string | undefined;
}

function DialogTitle({ className, ...props }: TitleProps) {
  return useDialogShape("DialogTitle") === "desktop" ? (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl tracking-title text-ink", className)}
      {...props}
    />
  ) : (
    // Pinned to the top of the sheet, so scrolling the form, or the keyboard revealing a field,
    // never carries the title off the screen.
    <DrawerTitle
      data-slot="dialog-title"
      className={cn(
        "sticky top-0 z-(--z-sticky) -mx-4 -mt-2 bg-plate px-4 pt-2 pb-1 tracking-title",
        className,
      )}
      {...props}
    />
  );
}

interface DescriptionProps extends Omit<DialogPrimitive.Description.Props, "className"> {
  className?: string | undefined;
}

function DialogDescription({ className, ...props }: DescriptionProps) {
  return useDialogShape("DialogDescription") === "desktop" ? (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-base text-ink-2", className)}
      {...props}
    />
  ) : (
    <DrawerDescription data-slot="dialog-description" className={className} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
