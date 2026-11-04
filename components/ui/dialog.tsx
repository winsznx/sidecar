"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Overlays portal to <body>, so they name their surface: `paper` (default) or the dark `band`. */
export type Surface = "paper" | "band";

export interface DialogContentProps
  extends Omit<ComponentPropsWithRef<typeof DialogPrimitive.Content>, "title" | "children"> {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, primary action last. Wrap the dismiss button in <DialogClose asChild>. */
  actions?: ReactNode;
  children?: ReactNode;
  /** Overlays portal to <body>, so they pick their surface explicitly. */
  surface?: Surface;
  hideCloseButton?: boolean;
}

/**
 * Without a description Radix expects an explicit `aria-describedby={undefined}`; with one,
 * the prop must be left out so Radix can point it at the description element.
 */
export function describedByOverride(description: ReactNode): { "aria-describedby"?: undefined } {
  return description === undefined ? { "aria-describedby": undefined } : {};
}

export function DialogCloseButton({ className }: { className?: string }): ReactNode {
  return (
    <DialogPrimitive.Close
      aria-label="Close"
      className={cx(
        "-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-fast ease-standard focus-ring hover:bg-hover hover:text-ink pointer-coarse:size-10",
        className,
      )}
    >
      <X aria-hidden="true" className="size-4" />
    </DialogPrimitive.Close>
  );
}

/**
 * Modal dialog. Focus moves into the dialog on open, is trapped while open,
 * and returns to the trigger on close (Radix Dialog). Escape and the close button dismiss it.
 */
export function DialogContent({
  title,
  description,
  actions,
  children,
  surface = "paper",
  hideCloseButton = false,
  className,
  ...rest
}: DialogContentProps): ReactNode {
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
          "fixed inset-x-4 top-1/2 z-modal mx-auto flex max-h-[calc(100dvh-2rem)] max-w-dialog -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-overlay",
          "data-[state=closed]:animate-fade-out data-[state=open]:animate-dialog-in focus-visible:outline-none",
          className,
        )}
        {...rest}
      >
        <header className="flex items-start gap-4 px-6 pt-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <DialogPrimitive.Title className="type-display text-heading leading-tight text-ink">{title}</DialogPrimitive.Title>
            {description !== undefined ? (
              <DialogPrimitive.Description className="text-body text-ink-2">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          {hideCloseButton ? null : <DialogCloseButton />}
        </header>
        {children !== undefined ? <div className="min-h-0 overflow-y-auto px-6 pt-4 text-body text-ink-2">{children}</div> : null}
        <footer className="flex flex-col-reverse gap-2 p-6 sm:flex-row sm:justify-end">{actions}</footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
