import type { ReactNode } from "react";

import { cx } from "./cx";

export interface SkeletonProps {
  /** Size with spacing utilities so the placeholder matches the final layout, e.g. "h-6 w-28". */
  className?: string;
  shape?: "line" | "block" | "pill";
}

const RADIUS: Record<NonNullable<SkeletonProps["shape"]>, string> = {
  line: "rounded-xs",
  block: "rounded-sm",
  pill: "rounded-full",
};

const DEFAULT_SIZE: Record<NonNullable<SkeletonProps["shape"]>, string> = {
  line: "h-3.5 w-full",
  block: "h-16 w-full",
  pill: "h-6 w-20",
};

/** Decorative placeholder. The loading region itself should carry aria-busy and a text label. */
export function Skeleton({ className, shape = "line" }: SkeletonProps): ReactNode {
  return <span aria-hidden="true" className={cx("skeleton block", RADIUS[shape], className ?? DEFAULT_SIZE[shape])} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }): ReactNode {
  return (
    <span aria-hidden="true" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? "h-3.5 w-3/5" : undefined} />
      ))}
    </span>
  );
}
