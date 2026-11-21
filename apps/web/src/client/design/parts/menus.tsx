import { Bell, Copy, Download, Ellipsis, Lock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Variants } from "../frame";
import type { Group } from "./types";

function HollerMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon" aria-label="Holler actions">
            <Ellipsis size={18} strokeWidth={2} />
          </Button>
        }
      />
      <DropdownMenuContent aria-label="Holler actions" align="end">
        <DropdownMenuItem>
          <Bell aria-hidden />
          Send reminder
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Download aria-hidden />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Copy aria-hidden />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger">
          <XCircle aria-hidden />
          Close now
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const menus: Group = {
  slug: "menus",
  title: "Menus and tips",
  lede: "What opens from a control and floats over the page: a plate with the hairline and one soft shadow, growing from the side nearest the control over 140 ms, gone in 100.",
  entries: [
    {
      slug: "dropdown-menu",
      name: "DropdownMenu",
      source: "components/ui/dropdown-menu.tsx",
      note: "Actions on one thing. The highlight glides between rows under the pointer. A danger action comes last, after a separator. On touch it rises as a sheet.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "A Holler's actions",
              note: "Press the button.",
              render: () => <HollerMenu />,
            },
          ]}
        />
      ),
    },
    {
      slug: "tooltip",
      name: "Tooltip",
      source: "components/ui/tooltip.tsx",
      note: "Every icon button shows its label as a tooltip after a pause. Never a native title, never on touch, and it repeats the accessible name rather than replacing it.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "On hover",
              render: () => (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button size="icon" aria-label="Send reminder">
                        <Bell size={18} strokeWidth={2} />
                      </Button>
                    }
                  />
                  <TooltipContent>Send reminder</TooltipContent>
                </Tooltip>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "popover",
      name: "Popover",
      source: "components/ui/popover.tsx",
      note: "A note about a control, anchored to it. It holds words, never controls of its own.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Why is this locked",
              render: () => (
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button>
                        <Lock aria-hidden strokeWidth={2} />
                        Anonymous
                      </Button>
                    }
                  />
                  <PopoverContent side="bottom" className="max-w-72 p-3 text-sm">
                    Anonymity cannot change once a Holler is sent, so nobody's answer is ever
                    relabelled.
                  </PopoverContent>
                </Popover>
              ),
            },
          ]}
        />
      ),
    },
  ],
};
