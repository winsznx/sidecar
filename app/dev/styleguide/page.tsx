import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Band } from "@/components/ui/band";
import { Accent } from "@/components/ui/section-heading";
import { SiteHeader } from "@/components/ui/site-header";

import { ColorTokens, ShapeAndMotion, TypeScale } from "./_components/foundations";
import { GuideSection, Specimen } from "./_components/guide-section";
import { HeroStudy, NewPrimitives } from "./_components/language-study";
import { PrimitiveGallery } from "./_components/primitive-gallery";
import { ReceiptStudy } from "./_components/receipt-study";
import { TradeStudy } from "./_components/trade-study";

export const metadata: Metadata = {
  title: "Sidecar styleguide",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: "foundations", label: "Foundations" },
  { id: "composition", label: "Composition" },
  { id: "paper", label: "Primitives on paper" },
  { id: "band", label: "Primitives on the band" },
  { id: "trade-study", label: "Trade screen study" },
  { id: "receipt-study", label: "Receipt study" },
] as const;

export default function StyleguidePage(): ReactNode {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-page flex-col gap-28 px-4 pt-14 pb-24 md:gap-36 md:px-8 md:pt-24">
        <header className="flex flex-col gap-12">
          <HeroStudy />
          <div className="flex flex-col gap-4 border-t border-dashed border-line-strong pt-6 md:flex-row md:items-start md:justify-between">
            <p className="max-w-measure text-small text-ink-3">
              Development only: this route returns 404 in production builds. Every figure on this page is simulated sample
              data and carries the SIMULATED badge.
            </p>
            <nav aria-label="Styleguide sections">
              <ul className="flex flex-wrap gap-x-1 gap-y-1">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="inline-flex h-8 items-center rounded-sm px-2.5 text-small text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors duration-fast ease-standard focus-ring hover:text-ink hover:decoration-ink pointer-coarse:h-10"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <GuideSection
          id="foundations"
          eyebrow="Foundations"
          title={
            <>
              Paper, ink, and <Accent>one marker.</Accent>
            </>
          }
          lede="Semantic tokens with one name per role. The same name resolves to the paper or the band value depending on the surface around it."
        >
          <div className="flex flex-col gap-14">
            <Specimen label="Colour, paper">
              <ColorTokens />
            </Specimen>
            <Specimen label="Colour, band">
              <Band padding="md">
                <ColorTokens />
              </Band>
            </Specimen>
            <Specimen label="Type">
              <TypeScale />
            </Specimen>
            <ShapeAndMotion />
          </div>
        </GuideSection>

        <GuideSection
          id="composition"
          eyebrow="Composition"
          title="New pieces for pages"
          lede="Header, section headings, floating cards, connectors and the band. Corner slots on a band take real readings only."
        >
          <NewPrimitives />
        </GuideSection>

        <GuideSection
          id="paper"
          eyebrow="Primitives"
          title="On paper"
          lede="Every primitive and its states on the default surface. Badge kinds are shown for styling; the numbers are placeholders."
        >
          <PrimitiveGallery surface="paper" />
        </GuideSection>

        <GuideSection id="band" eyebrow="Primitives" title="On the band" lede="The same primitives inside a band, with no new classes.">
          <Band padding="md" grid>
            <PrimitiveGallery surface="band" />
          </Band>
        </GuideSection>

        <GuideSection
          id="trade-study"
          eyebrow="Study"
          title="Trade screen"
          lede="Existing position, intended trade, the comparison, then one action. The two route cards are equal in size and weight; only the trader's selection changes them."
        >
          <TradeStudy />
        </GuideSection>

        <GuideSection
          id="receipt-study"
          eyebrow="Study"
          title="Receipt"
          lede="Inspection rows with dotted leaders, a footer that counts the checks, and a stamp reserved for a fully verified result."
        >
          <ReceiptStudy />
        </GuideSection>
      </main>
    </>
  );
}
