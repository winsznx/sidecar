import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx";

export interface SidecarGlyphProps extends Omit<ComponentPropsWithRef<"svg">, "children"> {
  /** Accessible name. Omit when the glyph sits next to the wordmark. */
  title?: string;
  /** Fill the compartment with the marker: the separate margin is the part Sidecar adds. */
  accent?: boolean;
}

/**
 * The main body and its docked compartment: the compartment sits lower and apart,
 * which is the product in one picture (same rider, separate margin). Every edge sits
 * on a whole unit of the 16-unit grid so it stays crisp at 16px. app/icon.svg repeats
 * these coordinates; change both together.
 */
export function SidecarGlyph({ title, accent = false, className, ...rest }: SidecarGlyphProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      role={title === undefined ? undefined : "img"}
      aria-hidden={title === undefined ? true : undefined}
      className={cx("size-4 shrink-0", className)}
      {...rest}
    >
      {title !== undefined ? <title>{title}</title> : null}
      <rect x="1" y="1" width="10" height="10" rx="3" />
      {accent ? (
        <rect x="12" y="7" width="3" height="8" rx="1.5" className="fill-accent stroke-current" strokeWidth={1} />
      ) : (
        <rect x="12" y="7" width="3" height="8" rx="1.5" />
      )}
    </svg>
  );
}

export interface SidecarMarkProps {
  size?: "sm" | "md" | "lg";
  accent?: boolean;
  className?: string;
}

const MARK_SIZE = {
  sm: { glyph: "size-4", word: "text-body" },
  md: { glyph: "size-5", word: "text-title" },
  lg: { glyph: "size-8", word: "text-display" },
} as const;

export function SidecarMark({ size = "md", accent = false, className }: SidecarMarkProps): ReactNode {
  const { glyph, word } = MARK_SIZE[size];
  return (
    <span className={cx("inline-flex items-center gap-2 text-ink", className)}>
      <SidecarGlyph className={glyph} accent={accent} />
      <span className={cx("type-display leading-none tracking-tight", word)}>Sidecar</span>
    </span>
  );
}
