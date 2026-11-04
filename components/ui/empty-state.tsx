import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./cx";

export interface EmptyStateProps {
  icon?: LucideIcon;
  /** States the fact plainly, e.g. "No open positions on this account". */
  title: ReactNode;
  /** What the person can do about it. */
  children?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/** A truthful "nothing here", with the next step. Never filled with sample rows. */
export function EmptyState({ icon: Icon, title, children, action, size = "md", className }: EmptyStateProps): ReactNode {
  return (
    <div
      className={cx(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong",
        size === "sm" ? "p-4" : "p-6",
        className,
      )}
    >
      {Icon ? (
        <span className="hatch inline-flex size-9 items-center justify-center rounded-sm border border-line-strong text-ink-3">
          <span className="inline-flex size-6 items-center justify-center rounded-xs bg-raised">
          <Icon aria-hidden="true" className="size-4" />
          </span>
        </span>
      ) : null}
      <div className="flex max-w-measure flex-col gap-1">
        <p className="text-title font-semibold tracking-tight text-ink">{title}</p>
        {children !== undefined ? <div className="text-small text-ink-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
