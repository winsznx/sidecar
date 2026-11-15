import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageShell } from "@/components/chrome/page-shell";
import { Button } from "@/components/ui/button";
import { Accent, SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound(): ReactNode {
  return (
    <PageShell measure="document">
      <SectionHeading
        as="h1"
        size="display"
        eyebrow="404 · Not found"
        title={
          <>
            Nothing is <Accent>at this address</Accent>.
          </>
        }
        lede="The link may be mistyped, or the page has moved. A receipt link needs the full transaction hash."
      />
      <nav aria-label="Where to go next" className="mt-10 flex flex-wrap gap-3">
        <Button asChild variant="primary">
          <Link href="/trade">Open the trade screen</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/receipt">Look up a receipt</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Back to the start</Link>
        </Button>
      </nav>
    </PageShell>
  );
}
