import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";

export function Kbd({ className, children, ...rest }: ComponentPropsWithRef<"kbd">): ReactNode {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line-strong bg-raised px-1 type-data text-micro text-ink-2 shadow-raised",
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
