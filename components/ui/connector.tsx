import type { ReactNode } from "react";

import { cx } from "./cx";

export type ConnectorCap = "none" | "dot" | "ring";

export interface ConnectorProps {
  orientation?: "vertical" | "horizontal";
  /** Dashed reads as a path between two things; dotted as a looser association. */
  variant?: "dashed" | "dotted";
  start?: ConnectorCap;
  end?: ConnectorCap;
  /** `accent` fills dot caps with the marker, for the one point the composition leads to. */
  tone?: "ink" | "accent";
  /** Sizing classes, e.g. "h-24" or "w-full". Without them the line stretches in a flex parent. */
  className?: string;
}

const LINE = {
  vertical: { dashed: "w-0 flex-1 border-l-2 border-dashed", dotted: "w-0 flex-1 border-l-2 border-dotted" },
  horizontal: { dashed: "h-0 flex-1 border-t-2 border-dashed", dotted: "h-0 flex-1 border-t-2 border-dotted" },
} as const;

function Cap({ cap, tone }: { cap: ConnectorCap; tone: "ink" | "accent" }): ReactNode {
  if (cap === "none") return null;
  if (cap === "ring") return <span className="size-2.5 shrink-0 rounded-full border-2 border-ink-3 bg-canvas" />;
  return (
    <span
      className={cx(
        "size-2.5 shrink-0 rounded-full",
        tone === "accent" ? "border-2 border-accent-ink bg-accent" : "bg-ink-3",
      )}
    />
  );
}

/** A decorative line that ties two parts of a composition together. Hidden from assistive tech. */
export function Connector({
  orientation = "vertical",
  variant = "dashed",
  start = "none",
  end = "dot",
  tone = "ink",
  className,
}: ConnectorProps): ReactNode {
  const vertical = orientation === "vertical";
  return (
    <span
      aria-hidden="true"
      data-orientation={orientation}
      className={cx(
        "pointer-events-none flex items-center",
        vertical ? "min-h-6 flex-col" : "min-w-6 flex-row",
        className,
      )}
    >
      <Cap cap={start} tone={tone} />
      <span className={cx("border-line-strong", LINE[orientation][variant])} />
      <Cap cap={end} tone={tone} />
    </span>
  );
}
