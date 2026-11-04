import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";
import type { StatusTone } from "./types";

export interface StatusPillProps extends ComponentPropsWithRef<"span"> {
  tone?: StatusTone;
  /** Replaces the dot. Use an icon whenever the state is a risk or a verdict. */
  icon?: LucideIcon;
  size?: "sm" | "md";
  /** `soft` fills with the tone, `outline` keeps the surface and draws the tone as a border. */
  appearance?: "soft" | "outline";
  children: ReactNode;
}

const SOFT: Record<StatusTone, string> = {
  neutral: "border-line bg-raised text-ink-2 shadow-raised",
  positive: "border-transparent bg-positive-soft text-positive",
  warning: "border-transparent bg-warning-soft text-warning",
  danger: "border-transparent bg-danger-soft text-danger",
};

const OUTLINE: Record<StatusTone, string> = {
  neutral: "border-line-strong text-ink-2",
  positive: "border-positive text-positive",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
};

const DOT: Record<StatusTone, string> = {
  neutral: "bg-ink-3",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** A state, never an action: pills are fully rounded so they never read as buttons (which are 6px). */
export function StatusPill({
  tone = "neutral",
  icon: Icon,
  size = "md",
  appearance = "soft",
  className,
  children,
  ...rest
}: StatusPillProps): ReactNode {
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border font-medium",
        size === "sm" ? "h-5 px-2 text-micro" : "h-6 px-2.5 text-caption",
        appearance === "soft" ? SOFT[tone] : OUTLINE[tone],
        className,
      )}
      {...rest}
    >
      {Icon ? (
        <Icon aria-hidden="true" className={cx("shrink-0", size === "sm" ? "size-3" : "size-3.5")} strokeWidth={2.25} />
      ) : (
        <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
