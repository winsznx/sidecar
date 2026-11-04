import Link from "next/link";
import type { ReactNode } from "react";

import { InspectionCard } from "@/components/ui/inspection-card";
import type { KeyValueItem } from "@/components/ui/key-value-list";
import { SectionHeading } from "@/components/ui/section-heading";

import { LandingEyebrow } from "./landing-eyebrow";
import { DECODED_FILL_HREF } from "./links";
import { LANDING_CHECKS } from "./truth-checks";

/** Rows carry no verdict: this lists what gets checked, it is not the result of a run. */
const CHECK_ROWS: ReadonlyArray<KeyValueItem> = LANDING_CHECKS.map((check, index) => ({
  id: check.id,
  label: (
    <span className="inline-flex items-baseline gap-2.5">
      <span aria-hidden="true" className="type-data text-caption text-ink-3 tabular">
        {String(index + 1).padStart(2, "0")}
      </span>
      {check.label}
    </span>
  ),
  // Below sm the value column would squeeze every label onto three lines, so what the check
  // reads moves under the label as a caption there.
  hint: (
    <span className="pl-7 sm:hidden">
      Reads <span className="type-data">{check.reads}</span>
    </span>
  ),
  value: <span className="type-data text-caption text-ink-2 max-sm:hidden">{check.reads}</span>,
}));

export function TruthCheckSection(): ReactNode {
  return (
    <section
      aria-labelledby="what-sidecar-checks"
      className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16"
    >
      <div className="flex flex-col gap-8">
        <LandingEyebrow index={2} className="-mb-3">
          What Sidecar checks
        </LandingEyebrow>
        <SectionHeading
          id="what-sidecar-checks"
          title="After you sign, the receipt has to agree."
          lede="Sidecar decodes the mined receipt and runs the same checks on every order. A check it can't run shows Unknown and is never counted as a pass. The receipt is stamped verified only when every check passes."
        />
        <p className="max-w-measure text-body text-ink-2">
          Want to see one?{" "}
          <Link href={DECODED_FILL_HREF} className="font-medium text-ink underline decoration-dashed underline-offset-4 focus-ring rounded-xs">
            Open a real BTC-PERP fill on Hideki, decoded
          </Link>
          . Someone else sent it, not Sidecar.
        </p>
      </div>
      <InspectionCard
        title="Checks on every order"
        headingAs="h3"
        meta={<span>Read from the receipt</span>}
        items={CHECK_ROWS}
        footnote={`${CHECK_ROWS.length} checks · pass, fail or unknown · never assumed`}
      />
    </section>
  );
}
