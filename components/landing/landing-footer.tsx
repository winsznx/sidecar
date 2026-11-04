import Link from "next/link";
import type { ReactNode } from "react";

import { SidecarMark } from "@/components/ui/sidecar-mark";

const FOOTER_LINK = "inline-flex min-h-10 items-center rounded-xs px-2 text-body text-ink-2 underline-offset-4 hover:text-ink hover:underline focus-ring";

export function LandingFooter(): ReactNode {
  return (
    <footer className="flex flex-col gap-6 border-t border-dashed border-line-strong pt-8 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-3">
        <SidecarMark size="md" accent />
        <p className="max-w-measure text-small text-ink-2">Built for dreamDEX perps on Somnia Hideki. Testnet, paper funds.</p>
      </div>
      <nav aria-label="Footer">
        <ul className="-mx-2 flex gap-2">
          <li>
            <Link href="/trade" className={FOOTER_LINK}>
              Trade
            </Link>
          </li>
          <li>
            <Link href="/proof" className={FOOTER_LINK}>
              Proof
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
