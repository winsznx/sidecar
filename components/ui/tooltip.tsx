"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

import { cx } from "./cx";

export interface TooltipProps {
  content: ReactNode;
  /** A single focusable element (button, link, or an element with tabIndex={0}). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
  className?: string;
}

/**
 * Supplementary text only. Anything a person needs in order to act belongs in visible copy,
 * because tooltips are unreachable on touch screens.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 300,
  className,
}: TooltipProps): ReactNode {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={12}
            className={cx(
              "z-popover max-w-xs rounded-sm border border-line-strong bg-raised px-2.5 py-1.5 text-caption text-ink shadow-float",
              "data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-raised" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
