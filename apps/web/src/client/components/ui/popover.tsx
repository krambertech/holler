import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/cn";

/*
 * Anchored on every device. It has no sheet shape, so it holds a note about a control and never
 * controls of its own.
 */

function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

interface TriggerProps extends Omit<PopoverPrimitive.Trigger.Props, "className"> {
  className?: string | undefined;
}

/** Compose the control through `render`: `<PopoverTrigger render={<Button>…</Button>} />`. */
function PopoverTrigger(props: TriggerProps) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

interface ContentProps
  extends Omit<PopoverPrimitive.Popup.Props, "className">,
    Pick<
      PopoverPrimitive.Positioner.Props,
      "anchor" | "align" | "alignOffset" | "side" | "sideOffset"
    > {
  className?: string | undefined;
}

function PopoverContent({
  className,
  anchor,
  align = "center",
  alignOffset = 0,
  side = "top",
  sideOffset = 10,
  children,
  ...props
}: ContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
        className="isolate z-(--z-dropdown)"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            // Grows out of the side nearest its control over 180 ms and shrinks back into it in 100.
            "floating w-max max-w-64 origin-(--transform-origin) rounded-md px-3 py-2 text-start text-sm text-ink outline-none transition-[opacity,translate,scale] duration-100 ease-(--ease-out) [--pop-y:-4px] data-open:duration-180 data-[side=top]:[--pop-y:4px] data-starting-style:translate-y-(--pop-y) data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:translate-y-(--pop-y) data-ending-style:scale-98 data-ending-style:opacity-0 motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-ending-style:scale-100",
            className,
          )}
          {...props}
        >
          <PopoverPrimitive.Arrow className="data-[side=bottom]:-top-2 data-[side=top]:-bottom-2 data-[side=top]:rotate-180">
            <ArrowTip />
          </PopoverPrimitive.Arrow>
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

/**
 * The tip that points at the control: the plate's fill with the hairline along its two sides, so the
 * bubble and its tip read as one shape. Base UI places it and flips it with the bubble.
 */
function ArrowTip() {
  return (
    <svg aria-hidden width="20" height="10" viewBox="0 0 20 10" fill="none" className="block">
      <path
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
        className="fill-plate"
      />
      <path
        d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7.00001L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66436 2.60207L4.77734 7.00001L2.13171 7.00001C2.87284 7.00001 3.58774 6.72568 4.13861 6.22989L8.99542 1.85876Z"
        className="fill-edge-2"
      />
    </svg>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
