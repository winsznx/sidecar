import type { ReactNode } from "react";

import { cx } from "./cx";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  /** `double` is the ledger rule used under paper headers. */
  variant?: "solid" | "dashed" | "double";
  /** Centered text on a horizontal rule, e.g. "or". */
  label?: ReactNode;
  className?: string;
}

const LINE: Record<NonNullable<DividerProps["variant"]>, string> = {
  solid: "border-solid border-line",
  dashed: "border-dashed border-line-strong",
  double: "border-double border-line-strong",
};

export function Divider({ orientation = "horizontal", variant = "solid", label, className }: DividerProps): ReactNode {
  if (orientation === "vertical") {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={cx("inline-block self-stretch border-l", LINE[variant], variant === "double" && "border-l-3", className)}
      />
    );
  }

  if (label !== undefined) {
    return (
      <div role="separator" className={cx("flex items-center gap-3 type-eyebrow text-ink-3", className)}>
        <span aria-hidden="true" className={cx("h-0 flex-1 border-t", LINE[variant], variant === "double" && "border-t-3")} />
        <span>{label}</span>
        <span aria-hidden="true" className={cx("h-0 flex-1 border-t", LINE[variant], variant === "double" && "border-t-3")} />
      </div>
    );
  }

  return <hr className={cx("h-0 border-0 border-t", LINE[variant], variant === "double" && "border-t-3", className)} />;
}
