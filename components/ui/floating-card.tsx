import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cx } from "./cx";

export type FloatingCardTilt = -2 | -1 | 0 | 1 | 2;

export interface FloatingCardProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Rotation in degrees. Keep the front card at 0 so its figures stay level. */
  tilt?: FloatingCardTilt;
  /** `front` lifts the card with the strongest shadow; `back` sits slightly smaller behind it. */
  depth?: "front" | "back";
  /** Nudges the card off the line of its neighbours. */
  offset?: "none" | "up" | "down";
  /** `ink` renders the card on the BAND tokens, for one dark card in a light composition. */
  tone?: "paper" | "ink";
  as?: "div" | "article" | "section" | "figure";
  children: ReactNode;
}

const TILT: Record<FloatingCardTilt, string> = {
  [-2]: "-rotate-2",
  [-1]: "-rotate-1",
  0: "",
  1: "rotate-1",
  2: "rotate-2",
};

const OFFSET = {
  none: "",
  up: "-translate-y-3",
  down: "translate-y-3",
} as const;

/**
 * Product UI shown as a physical card lifted off the paper. A composition of these is
 * illustration: every figure inside still needs its provenance badge, and sample figures carry
 * SIMULATED.
 */
export function FloatingCard({
  tilt = 0,
  depth = "front",
  offset = "none",
  tone = "paper",
  as: Element = "div",
  className,
  children,
  ...rest
}: FloatingCardProps): ReactNode {
  return (
    <Element
      data-surface={tone === "ink" ? "band" : undefined}
      data-depth={depth}
      className={cx(
        "relative min-w-0 rounded-xl border",
        tone === "ink" ? "border-line-strong bg-canvas text-ink" : "border-line bg-raised",
        depth === "front" ? "z-raised shadow-float" : "scale-[0.96] shadow-card",
        TILT[tilt],
        OFFSET[offset],
        className,
      )}
      {...rest}
    >
      {children}
    </Element>
  );
}
