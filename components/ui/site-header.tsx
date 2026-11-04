import { Menu, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "./cx";
import { SidecarMark } from "./sidecar-mark";

export type SiteSection = "trade" | "proof" | "receipt" | "start";

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

export const SITE_LINKS: ReadonlyArray<{ section: SiteSection; href: string; label: string }> = [
  { section: "trade", href: "/trade", label: "Trade" },
  { section: "proof", href: "/proof", label: "Proof" },
  { section: "receipt", href: "/receipt", label: "Receipts" },
  { section: "start", href: "/start", label: "Get started" },
];

const NAV_ID = "site-nav";

const NAV_LINK =
  "inline-flex h-9 items-center rounded-sm px-3 text-body text-ink-2 transition-colors duration-fast ease-standard focus-ring " +
  "hover:bg-hover hover:text-ink pointer-coarse:h-10 max-lg:h-10 max-lg:w-full " +
  "aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[7px]";

/**
 * Site-wide header: the mark, the sections, then a slot for network facts and the wallet.
 *
 * Rows by width: from `lg` everything sits on one line, with wider gaps from `xl`. Below `lg`
 * the nav folds behind a Menu disclosure while the wallet stays on the first row, so connecting
 * never takes an extra tap, and the network facts take a second row. The disclosure is a native details element,
 * so it works before hydration and on pages that render this header on the server.
 */
export function SiteHeader({
  current,
  meta,
  wallet,
  sticky = false,
  homeHref = "/",
  className,
}: SiteHeaderProps): ReactNode {
  return (
    <header
      className={cx(
        "group/header border-b border-dashed border-line-strong bg-canvas",
        sticky && "sticky top-0 z-sticky",
        className,
      )}
    >
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-8 xl:gap-x-6">
        <Link
          href={homeHref}
          aria-label="Sidecar home"
          className="order-1 inline-flex shrink-0 items-center rounded-xs focus-ring pointer-coarse:min-h-10"
        >
          <SidecarMark size="md" accent />
        </Link>

        <nav
          id={NAV_ID}
          aria-label="Sidecar"
          className={cx(
            "order-4 basis-full lg:order-2 lg:basis-auto",
            "max-lg:hidden max-lg:border-t max-lg:border-dashed max-lg:border-line-strong max-lg:pt-2 max-lg:group-has-[details[open]]/header:block",
          )}
        >
          <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
            {SITE_LINKS.map((link) => (
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

        {meta !== undefined ? (
          <div className="order-5 flex min-w-0 basis-full flex-wrap items-center justify-between gap-x-2 gap-y-2 lg:order-3 lg:justify-start lg:gap-x-3 lg:ml-auto lg:basis-auto">
            {meta}
          </div>
        ) : null}

        {wallet !== undefined ? (
          <div className={cx("order-2 ml-auto flex min-w-0 shrink-0 items-center lg:order-4", meta !== undefined && "lg:ml-0")}>
            {wallet}
          </div>
        ) : null}

        <details className={cx("order-3 lg:hidden", wallet === undefined && "ml-auto")}>
          <summary
            aria-controls={NAV_ID}
            className={cx(
              "inline-flex size-10 cursor-pointer list-none items-center justify-center rounded-sm border border-line-strong bg-raised text-ink-2 shadow-raised",
              "transition-colors duration-fast ease-standard focus-ring hover:border-control hover:bg-hover hover:text-ink [&::-webkit-details-marker]:hidden",
            )}
          >
            <Menu aria-hidden="true" className="size-4 group-has-[details[open]]/header:hidden" />
            <X aria-hidden="true" className="hidden size-4 group-has-[details[open]]/header:block" />
            <span className="sr-only">Menu</span>
          </summary>
        </details>
      </div>
    </header>
  );
}
