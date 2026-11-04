import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getAddress } from "viem";

import { NetworkLabel } from "@/components/icons/token-label";
import { SidecarMark } from "@/components/ui/sidecar-mark";
import { NETWORK_NAME } from "@/lib/dreamdex/chain-age";
import { explorerAddressUrl, NETWORK } from "@/lib/dreamdex/config";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { PUBLIC_FILL_HASH } from "@/lib/evidence/public-fill";

/** The MarginBank every listed Hideki market settles through, as recorded in the README. */
const HIDEKI_MARGIN_BANK = getAddress("0x478769E1177C0773c43A593DCCc4Ad15F15F1394");

const MARKETS_SDK_URL = "https://www.npmjs.com/package/@somnia-chain/markets-sdk";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterGroup {
  id: string;
  title: string;
  links: readonly FooterLink[];
}

export const FOOTER_GROUPS: readonly FooterGroup[] = [
  {
    id: "product",
    title: "Product",
    links: [
      { label: "Trade", href: "/trade" },
      { label: "Get started", href: "/start" },
      { label: "Receipts", href: "/receipt" },
    ],
  },
  {
    id: "evidence",
    title: "Evidence",
    links: [
      { label: "Proof", href: "/proof" },
      { label: "A decoded public fill", href: `/receipt/${PUBLIC_FILL_HASH}` },
      { label: "MarginBank on the explorer", href: explorerAddressUrl(HIDEKI_MARGIN_BANK), external: true },
    ],
  },
  {
    id: "resources",
    title: "Resources",
    links: [
      { label: "Markets SDK on npm", href: MARKETS_SDK_URL, external: true },
      { label: "Hideki explorer", href: NETWORK.explorerUrl, external: true },
    ],
  },
];

const FOOTER_LINK =
  "inline-flex min-h-10 items-center gap-1 rounded-xs text-body text-ink-2 underline-offset-4 hover:text-ink hover:underline focus-ring md:min-h-8 pointer-coarse:min-h-10";

function FooterLinkItem({ link }: { link: FooterLink }): ReactNode {
  if (link.external === true) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={FOOTER_LINK}>
        {link.label}
        <ArrowUpRight aria-hidden="true" className="size-3.5 text-ink-3" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={link.href} className={FOOTER_LINK}>
      {link.label}
    </Link>
  );
}

/** Site-wide footer: grouped links, the testnet disclaimer and the network line. Static, so it renders on the server. */
export function SiteFooter(): ReactNode {
  return (
    <footer className="flex flex-col gap-10 border-t border-dashed border-line-strong pt-10">
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-16">
        <div className="flex flex-col gap-3">
          <SidecarMark size="md" accent />
          <p className="max-w-measure text-small text-ink-2">
            Testnet only. Every balance is faucet money on {NETWORK_NAME}, nothing here is worth anything, and Sidecar never sees your keys.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <h2 id={`footer-${group.id}`} className="type-eyebrow text-ink-3">
                {group.title}
              </h2>
              <ul aria-labelledby={`footer-${group.id}`} className="flex flex-col">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <p className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4 type-eyebrow text-ink-3">
        <NetworkLabel>
          {NETWORK_NAME} · chain {HIDEKI_CHAIN_ID}
        </NetworkLabel>
        <span>Paper funds only</span>
      </p>
    </footer>
  );
}
