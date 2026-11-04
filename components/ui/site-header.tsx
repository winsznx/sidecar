import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "./cx";
import { SidecarMark } from "./sidecar-mark";

export type SiteSection = "trade" | "proof";

export interface SiteHeaderProps {
  /** The section that is open, so its link reads as the current page. */
  current?: SiteSection;
  /** Network facts between the nav and the wallet, e.g. chain id and live block. Real reads only. */
  meta?: ReactNode;
  /** The wallet control, right edge. */
  wallet?: ReactNode;
  /** Keep the header on screen while the page scrolls. */
  sticky?: boolean;
  /** Where the mark links. */
  homeHref?: string;
  className?: string;
}

const LINKS: ReadonlyArray<{ section: SiteSection; href: string; label: string }> = [
  { section: "trade", href: "/trade", label: "Trade" },
  { section: "proof", href: "/proof", label: "Proof" },
];

const NAV_LINK =
  "inline-flex h-9 items-center rounded-sm px-3 text-body text-ink-2 transition-colors duration-fast ease-standard focus-ring " +
  "hover:bg-hover hover:text-ink pointer-coarse:h-10 " +
  "aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[7px]";

/**
 * Site-wide header: the mark, the two sections, then a slot for network facts and the wallet.
 * Below `md` the meta and wallet move to a second row so neither truncates an address.
 */
export function SiteHeader({
  current,
  meta,
  wallet,
  sticky = false,
  homeHref = "/",
  className,
}: SiteHeaderProps): ReactNode {
  const hasTrailing = meta !== undefined || wallet !== undefined;
  return (
    <header
      className={cx(
        "border-b border-dashed border-line-strong bg-canvas",
        sticky && "sticky top-0 z-sticky",
        className,
      )}
    >
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:flex-nowrap md:px-8">
        <Link
          href={homeHref}
          aria-label="Sidecar home"
          className="inline-flex shrink-0 items-center rounded-xs focus-ring pointer-coarse:min-h-10"
        >
          <SidecarMark size="md" accent />
        </Link>
        <nav aria-label="Sidecar" className="ml-auto md:ml-0">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => (
              <li key={link.section}>
                <Link
                  href={link.href}
                  aria-current={current === link.section ? "page" : undefined}
                  className={NAV_LINK}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {hasTrailing ? (
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 md:ml-auto md:w-auto md:flex-nowrap md:justify-end">
            {meta !== undefined ? <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{meta}</div> : null}
            {wallet !== undefined ? <div className="flex shrink-0 items-center">{wallet}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
