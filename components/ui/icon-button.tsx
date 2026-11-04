"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";
import { Tooltip } from "./tooltip";

export type IconButtonSize = "sm" | "md";
export type IconButtonVariant = "ghost" | "secondary";

export interface IconButtonProps extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  /** Accessible name. Also shown as a tooltip when `tooltip` is true. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  tooltip?: boolean;
}

const SIZE: Record<IconButtonSize, string> = {
  sm: "size-8 pointer-coarse:size-10",
  md: "size-10",
};

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "border-transparent bg-transparent text-ink-2 hover:bg-hover hover:text-ink",
  secondary: "border-line-strong bg-raised text-ink-2 shadow-raised hover:border-control hover:bg-hover hover:text-ink",
};

export function IconButton({
  label,
  icon,
  size = "sm",
  variant = "ghost",
  tooltip = false,
  className,
  type = "button",
  ...rest
}: IconButtonProps): ReactNode {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-sm border transition-colors duration-fast ease-standard focus-ring",
        "disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent [&_svg]:size-4",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );

  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
