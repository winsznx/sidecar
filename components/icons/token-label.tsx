import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

import { NetworkIcon, TokenIcon } from "./token-icon";

export type TokenLabelSize = 16 | 20 | 24 | 28;

/*
 * Centres the logo on the cap height of the surrounding text (caps are about 0.7em in all three
 * faces). Listed as literals so Tailwind sees every class at build time.
 */
const CAP_CENTRE: Record<TokenLabelSize, string> = {
  16: "align-[calc(0.35em-8px)]",
  20: "align-[calc(0.35em-10px)]",
  24: "align-[calc(0.35em-12px)]",
  28: "align-[calc(0.35em-14px)]",
};

const GAP: Record<TokenLabelSize, string> = {
  16: "mr-1.5",
  20: "mr-2",
  24: "mr-2",
  28: "mr-2.5",
};

// Preflight makes img and svg block-level; the letter fallback is a span and keeps its own display.
const INLINE_MARK = "[&>img]:inline [&>svg]:inline";

const FIRST_WORD = /^(\S*)([\s\S]*)$/;

function plainText(children: ReactNode): string | null {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children) && children.every((child) => typeof child === "string" || typeof child === "number")) {
    return children.join("");
  }
  return null;
}

/*
 * Browsers may break a line right after an inline image, which strands the logo at the end of a
 * line in a narrow cell. Plain-text labels keep the logo and their first word together.
 */
function Glued({ mark, children }: { mark: ReactNode; children: ReactNode }): ReactNode {
  const text = plainText(children);
  const match = text === null ? null : FIRST_WORD.exec(text);
  if (match === null) {
    return (
      <>
        <span className={INLINE_MARK}>{mark}</span>
        {children}
      </>
    );
  }
  return (
    <>
      <span className={cx(INLINE_MARK, "whitespace-nowrap")}>
        {mark}
        {match[1]}
      </span>
      {match[2]}
    </>
  );
}

export interface TokenLabelProps {
  /** Symbol the logo is resolved from ("BTC", "BTC-PERP", "USDso", "STT"). */
  symbol: string;
  /** Visible text after the logo; defaults to `symbol`. */
  children?: ReactNode;
  /** 16 in rows and pills, 20 in headings and the ticket header, 24 to 28 in headline cards. */
  size?: TokenLabelSize;
  className?: string;
}

/*
 * Plain inline flow rather than flex: a provenance rule (text-decoration) on an ancestor keeps
 * reaching the text, and the label still sits on the baseline of leader rows and table cells.
 * The logo is decorative because the symbol is always visible beside it.
 */
export function TokenLabel({ symbol, children, size = 16, className }: TokenLabelProps): ReactNode {
  return (
    <span className={className}>
      <Glued mark={<TokenIcon symbol={symbol} size={size} className={cx(CAP_CENTRE[size], GAP[size])} />}>{children ?? symbol}</Glued>
    </span>
  );
}

export function NetworkLabel({ children, size = 16, className }: Omit<TokenLabelProps, "symbol">): ReactNode {
  return (
    <span className={className}>
      <Glued mark={<NetworkIcon size={size} className={cx(CAP_CENTRE[size], GAP[size])} />}>{children}</Glued>
    </span>
  );
}
