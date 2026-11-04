"use client";

import { Lock } from "lucide-react";
import { Slot } from "radix-ui";
import { useId, type ComponentPropsWithRef, type MouseEvent, type ReactNode } from "react";

import { cx } from "./cx";
import type { RouteTone } from "./types";

/**
 * `accent` is the marker fill. Use it for at most one call to action per view (the next step
 * the page exists for); everything else is primary, secondary or ghost.
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Route identity for primary and secondary buttons that act on account A or B. Ignored by `accent`. */
  tone?: RouteTone;
  /** Keeps the tone and focus, marks the button busy, blocks repeat clicks and shows a progress sweep. */
  loading?: boolean;
  /** Replaces the label while loading, e.g. "Waiting for wallet". */
  loadingLabel?: ReactNode;
  /**
   * Blocks the action and explains why, in visible text announced as the button's description.
   * Unlike `disabled`, the button stays focusable so keyboard and screen-reader users reach the reason.
   */
  disabledReason?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  /** Layout classes for the wrapper that holds the button and its disabled reason, e.g. "md:w-auto". Without a reason the wrapper is `display: contents` and these do not apply. */
  wrapperClassName?: string;
  /** Render the child element (for example a link) with button styling. Ignores loading and disabledReason. */
  asChild?: boolean;
}

// Labels may wrap rather than truncate: a CTA that names an address must never hide part of it.
const BASE =
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 overflow-hidden rounded-sm border text-center font-medium " +
  "transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard focus-ring " +
  "active:translate-y-px aria-busy:cursor-progress aria-busy:active:translate-y-0 " +
  "aria-disabled:cursor-not-allowed aria-disabled:active:translate-y-0 disabled:cursor-not-allowed";

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1 text-small pointer-coarse:min-h-10",
  md: "min-h-10 px-4 py-1.5 text-body",
  lg: "min-h-12 px-6 py-2 text-lead font-semibold",
};

const PRIMARY: Record<RouteTone, string> = {
  neutral: "border-transparent bg-key text-ink-inverse shadow-button hover:bg-key-hover",
  a: "border-transparent bg-account-a text-ink-inverse shadow-button hover:bg-account-a-hover",
  b: "border-transparent bg-account-b text-ink-inverse shadow-button hover:bg-account-b-hover",
};

const SECONDARY: Record<RouteTone, string> = {
  neutral: "border-line-strong bg-raised text-ink shadow-raised hover:border-control hover:bg-hover",
  a: "border-account-a-line bg-raised text-account-a hover:bg-account-a-soft",
  b: "border-account-b-line bg-raised text-account-b hover:bg-account-b-soft",
};

const VARIANT: Record<Exclude<ButtonVariant, "primary" | "secondary">, string> = {
  accent: "border-accent-line bg-accent font-semibold text-accent-ink shadow-button hover:bg-accent-hover",
  ghost: "border-transparent bg-transparent text-ink-2 hover:bg-hover hover:text-ink",
  danger: "border-transparent bg-danger text-ink-inverse hover:bg-danger-hover",
};

const INERT =
  "aria-disabled:border-line aria-disabled:bg-raised aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:bg-raised " +
  "disabled:border-line disabled:bg-raised disabled:text-ink-3 disabled:shadow-none disabled:hover:bg-raised";

function variantClass(variant: ButtonVariant, tone: RouteTone): string {
  if (variant === "primary") return PRIMARY[tone];
  if (variant === "secondary") return SECONDARY[tone];
  return VARIANT[variant];
}

export function buttonClassName({
  variant = "primary",
  size = "md",
  tone = "neutral",
  block = false,
}: Pick<ButtonProps, "variant" | "size" | "tone" | "block">): string {
  return cx(BASE, SIZE[size], variantClass(variant, tone), INERT, block && "w-full");
}

export function Button({
  variant = "primary",
  size = "md",
  tone = "neutral",
  loading = false,
  loadingLabel,
  disabledReason,
  leading,
  trailing,
  block = false,
  wrapperClassName,
  asChild = false,
  className,
  children,
  onClick,
  type = "button",
  "aria-describedby": describedBy,
  ...rest
}: ButtonProps): ReactNode {
  const reasonId = useId();
  const classes = cx(buttonClassName({ variant, size, tone, block }), className);

  if (asChild) {
    return (
      <Slot.Root className={classes} onClick={onClick} aria-describedby={describedBy} {...rest}>
        {children}
      </Slot.Root>
    );
  }

  const inert = disabledReason !== undefined;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (inert || loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  const button = (
    <button
      type={type}
      className={classes}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      aria-describedby={cx(describedBy, disabledReason !== undefined && reasonId) || undefined}
      onClick={handleClick}
      {...rest}
    >
      {leading}
      <span className="min-w-0">{loading && loadingLabel !== undefined ? loadingLabel : children}</span>
      {trailing}
      {loading ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
          <span className="block h-full w-2/5 animate-sweep bg-current opacity-60 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-30" />
        </span>
      ) : null}
    </button>
  );

  // The wrapper stays mounted when the reason comes and goes, so the button keeps focus and refs.
  return (
    <span
      className={
        disabledReason === undefined
          ? "contents"
          : cx(
              block ? "flex w-full flex-col items-stretch gap-1.5" : "inline-flex flex-col items-start gap-1.5",
              wrapperClassName,
            )
      }
    >
      {button}
      {disabledReason === undefined ? null : (
        <span id={reasonId} className="inline-flex items-start gap-1.5 text-caption text-ink-2">
          <Lock aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-ink-3" />
          {disabledReason}
        </span>
      )}
    </span>
  );
}
