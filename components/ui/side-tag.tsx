import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import type { OrderSide } from "@/lib/dreamdex/types";

import { cx } from "./cx";

const SIDE = {
  long: { label: "Long", icon: ArrowUpRight, className: "bg-long-soft text-long" },
  short: { label: "Short", icon: ArrowDownRight, className: "bg-short-soft text-short" },
} as const;

export interface SideTagProps {
  side: OrderSide;
  size?: "sm" | "md";
  className?: string;
}

/** Direction as hue + arrow + word, so it survives greyscale and colour-blind viewing. */
export function SideTag({ side, size = "md", className }: SideTagProps): ReactNode {
  const { label, icon: Icon, className: tone } = SIDE[side];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-xs font-semibold",
        size === "sm" ? "h-5 px-1.5 text-caption" : "h-6 px-2 text-small",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.5} />
      {label}
    </span>
  );
}
