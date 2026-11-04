"use client";

import { useState, type ReactNode } from "react";

import { cx } from "./cx";

export interface ValueFlashProps {
  /** The formatted value. A change (not the first render) replays a short highlight. */
  value: string;
  children?: ReactNode;
  className?: string;
}

export function ValueFlash({ value, children, className }: ValueFlashProps): ReactNode {
  const [shownValue, setShownValue] = useState(value);
  const [changes, setChanges] = useState(0);

  if (value !== shownValue) {
    setShownValue(value);
    setChanges(changes + 1);
  }

  return (
    <span key={changes} data-changed={changes > 0 || undefined} className={cx("rounded-xs", changes > 0 && "animate-flash", className)}>
      {children ?? value}
    </span>
  );
}
