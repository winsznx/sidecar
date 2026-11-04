import { CircleSlash } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./cx";

export interface UnavailableProps {
  /** Plain-language cause, e.g. "The protocol cannot price this market right now." Always required. */
  reason: string;
  /** The word shown on the chip. Keep it a state, not a number. */
  label?: string;
  /** `block` replaces a figure and shows the reason; `inline` fits a table cell and keeps the reason for assistive tech and hover. */
  variant?: "block" | "inline";
  className?: string;
}

/**
 * Stands in for a value that could not be read or calculated. It is deliberately never a zero,
 * a dash or an empty string, so a missing reading cannot be mistaken for a real one.
 */
export function Unavailable({ reason, label = "Unavailable", variant = "block", className }: UnavailableProps): ReactNode {
  if (variant === "inline") {
    return (
      <span
        title={reason}
        className={cx("hatch inline-flex items-center rounded-xs border border-line-strong p-0.5 align-middle", className)}
      >
        <span className="inline-flex items-center gap-1 rounded-xs bg-raised px-1.5 text-caption font-medium text-ink-2">
          <CircleSlash aria-hidden="true" className="size-3 text-ink-3" />
          {label}
          <span className="sr-only">: {reason}</span>
        </span>
      </span>
    );
  }

  return (
    <span className={cx("hatch flex w-full items-center rounded-md border border-line-strong p-1", className)}>
      <span className="inline-flex min-w-0 items-start gap-2 rounded-sm bg-raised px-2.5 py-1.5 text-small shadow-raised">
        <CircleSlash aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
        <span className="min-w-0">
          <span className="font-medium text-ink">{label}</span>
          <span className="text-ink-2">. {reason}</span>
        </span>
      </span>
    </span>
  );
}
