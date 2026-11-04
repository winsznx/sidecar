"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";
import { DialogCloseButton, describedByOverride, type Surface } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export interface SheetContentProps
  extends Omit<ComponentPropsWithRef<typeof DialogPrimitive.Content>, "title" | "children"> {
  title: ReactNode;
  description?: ReactNode;
  /** Small mono line above the title, e.g. an Eyebrow. */
  eyebrow?: ReactNode;
  children?: ReactNode;
  /** Pinned under the scrolling body. */
  footer?: ReactNode;
  surface?: Surface;
}

/**
 * Drawer for detail that should not leave the trade screen, such as "See exact calculations".
 * Bottom sheet on small screens, right-hand panel from md up. Same focus handling as Dialog.
 */
export function SheetContent({
  title,
  description,
  eyebrow,
  children,
  footer,
  surface = "paper",
  className,
  ...rest
}: SheetContentProps): ReactNode {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-surface={surface}
        className="fixed inset-0 z-overlay bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
      />
      <DialogPrimitive.Content
        data-surface={surface}
        {...describedByOverride(description)}
        className={cx(
          "fixed inset-x-0 top-16 bottom-0 z-modal flex flex-col rounded-t-xl border border-line bg-raised shadow-overlay",
          "data-[state=closed]:animate-fade-out data-[state=open]:animate-sheet-in-bottom",
          "md:inset-y-0 md:right-0 md:left-auto md:w-full md:max-w-sheet md:rounded-none md:rounded-l-xl md:data-[state=open]:animate-sheet-in-right",
          "focus-visible:outline-none",
          className,
        )}
        {...rest}
      >
        <header className="flex items-start gap-4 border-b border-dashed border-line-strong px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {eyebrow}
            <DialogPrimitive.Title className="type-display text-heading leading-tight text-ink">{title}</DialogPrimitive.Title>
            {description !== undefined ? (
              <DialogPrimitive.Description className="text-small text-ink-2">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogCloseButton />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer !== undefined ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
