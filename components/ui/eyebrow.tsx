import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";

export interface EyebrowProps extends ComponentPropsWithRef<"p"> {
  /**
   * Step number. Only use it when the sections really are an ordered flow
   * (positions, new trade, where it lives, sign), never as decoration.
   */
  index?: number;
  as?: "p" | "span" | "h2" | "h3";
}

/** Mono label above a heading. Uppercase is visual only, so screen readers read normal words. */
export function Eyebrow({ index, as: Element = "p", className, children, ...rest }: EyebrowProps): ReactNode {
  return (
    <Element className={cx("type-eyebrow text-ink-3", className)} {...rest}>
      {index !== undefined ? (
        <>
          <span className="font-semibold text-ink">{String(index).padStart(2, "0")}</span>{" "}
          <span aria-hidden="true" className="text-ink-3">
            ·
          </span>{" "}
        </>
      ) : null}
      {children}
    </Element>
  );
}
