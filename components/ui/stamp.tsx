import { CircleX, Hourglass } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./cx";

export type StampStatus = "verified" | "not-verified" | "pending";

export interface StampProps {
  status: StampStatus;
  /** Mono line under the word, e.g. "6 / 6 checks · block #38,357,701". */
  detail?: string;
  className?: string;
}

/**
 * Verdict mark for receipts and proof records. Only a verified result gets the rotated
 * double-ruled stamp; the other states are flat tags so they can never be mistaken for a pass.
 */
export function Stamp({ status, detail, className }: StampProps): ReactNode {
  if (status === "verified") {
    return (
      <span
        className={cx(
          "inline-flex -rotate-3 animate-stamp-in flex-col items-center gap-0.5 rounded-sm border-4 border-double border-positive px-3.5 py-1.5 text-positive paper:mix-blend-multiply",
          className,
        )}
      >
        <span className="type-display text-title uppercase leading-tight">Verified</span>
        {detail !== undefined ? <span className="type-eyebrow">{detail}</span> : null}
      </span>
    );
  }

  const notVerified = status === "not-verified";
  const Icon = notVerified ? CircleX : Hourglass;
  return (
    <span
      className={cx(
        "inline-flex flex-col items-start gap-0.5 rounded-xs border px-2.5 py-1.5",
        notVerified ? "border-dashed border-danger text-danger" : "border-dotted border-ink-3 text-ink-2",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 type-eyebrow">
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
        {notVerified ? "Not verified" : "Pending"}
      </span>
      {detail !== undefined ? <span className="text-caption text-ink-2">{detail}</span> : null}
    </span>
  );
}
