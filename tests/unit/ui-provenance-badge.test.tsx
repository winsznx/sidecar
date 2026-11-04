import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ProvenanceBadge,
  groupDigits,
  provenanceDescription,
  provenanceLabel,
  provenanceRuleClass,
} from "@/components/ui/provenance-badge";
import type { Source, SourceKind } from "@/lib/dreamdex/types";

afterEach(cleanup);

const READ_AT = "2026-11-01T12:04:31.000Z";

const LABELLED: ReadonlyArray<{ source: Source; label: string }> = [
  { source: { kind: "chain", block: 38_357_692n, readAt: READ_AT, via: "getMarginAccount" }, label: "CHAIN · #38,357,692" },
  { source: { kind: "sdk", block: 38_357_692n, readAt: READ_AT, via: "previewPerpOrderMargin" }, label: "SDK · #38,357,692" },
  {
    source: { kind: "chain", block: 38_357_692n, readAt: READ_AT, via: "getMarginAccount", pinned: true },
    label: "CHAIN · #38,357,692",
  },
  {
    source: { kind: "chain", block: 38_357_692n, readAt: READ_AT, via: "getPerpVoucher", pinned: false },
    label: "CHAIN · HEAD ~#38,357,692",
  },
  {
    source: { kind: "sdk", block: 38_357_692n, readAt: READ_AT, via: "getPerpLeverage", pinned: false },
    label: "SDK · HEAD ~#38,357,692",
  },
  { source: { kind: "indexer", readAt: READ_AT, via: "listPerpMarkets" }, label: "INDEXED" },
  {
    source: { kind: "indexer", readAt: READ_AT, via: "listPerpMarkets", updatedAtBlock: 1_234n },
    label: "INDEXED · #1,234",
  },
  { source: { kind: "estimate", basis: "Sidecar arithmetic over SDK inputs" }, label: "EST" },
  { source: { kind: "scenario", basis: "BTC moved -12% from mark" }, label: "SCENARIO" },
  { source: { kind: "simulated", note: "Test fixture" }, label: "SIMULATED" },
];

describe("ProvenanceBadge", () => {
  it.each(LABELLED)("renders $label for a $source.kind source", ({ source, label }) => {
    const { container } = render(<ProvenanceBadge source={source} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(provenanceLabel(source)).toBe(label);
    expect(container.querySelector(`[data-provenance="${source.kind}"]`)).not.toBeNull();
  });

  it("gives assistive tech the full source sentence, not the abbreviation", () => {
    render(
      <ProvenanceBadge source={{ kind: "chain", block: 38_357_692n, readAt: READ_AT, via: "getMarginAccount" }} />,
    );

    expect(screen.getByText("CHAIN · #38,357,692")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByText("Chain read at block 38,357,692 via getMarginAccount, 12:04:31 UTC."),
    ).toBeInTheDocument();
  });

  it("does not claim an exact block for a head read that was not pinned", () => {
    expect(
      provenanceDescription({ kind: "chain", block: 38_357_692n, readAt: READ_AT, via: "getPerpVoucher", pinned: false }),
    ).toBe("Chain read at the head (about block 38,357,692, not pinned) via getPerpVoucher, 12:04:31 UTC.");
    expect(
      provenanceDescription({ kind: "sdk", block: 9n, readAt: READ_AT, via: "getPerpLeverage", pinned: false }),
    ).toBe("SDK calculation over chain state at the head (about block 9, not pinned) via getPerpLeverage, 12:04:31 UTC.");
  });

  it("says plainly that simulated and scenario values are not live", () => {
    expect(provenanceDescription({ kind: "simulated", note: "Fixture" })).toBe(
      "Simulated sample data, not live state: Fixture",
    );
    expect(provenanceDescription({ kind: "scenario", basis: "BTC -12%" })).toBe(
      "Scenario estimate, not a protocol value: BTC -12%",
    );
  });

  it("keeps an unparseable read time as given instead of inventing one", () => {
    expect(provenanceDescription({ kind: "sdk", block: 1n, readAt: "pending", via: "getMaxPerpOrderSize" })).toBe(
      "SDK calculation over chain state at block 1 via getMaxPerpOrderSize, pending.",
    );
  });

  it("draws no rule under chain and SDK figures and a distinct rule for every other source", () => {
    const rules: Record<SourceKind, string> = {
      chain: provenanceRuleClass("chain"),
      sdk: provenanceRuleClass("sdk"),
      indexer: provenanceRuleClass("indexer"),
      estimate: provenanceRuleClass("estimate"),
      scenario: provenanceRuleClass("scenario"),
      simulated: provenanceRuleClass("simulated"),
    };

    expect(rules.chain).toBe("");
    expect(rules.sdk).toBe("");
    expect(rules.indexer).toBe("rule-indexed");
    expect(rules.estimate).toBe("rule-estimate");
    expect(rules.scenario).toBe("rule-estimate");
    expect(rules.simulated).toBe("rule-simulated");
    expect(provenanceRuleClass(undefined)).toBe("");
  });
});

describe("groupDigits", () => {
  it.each([
    [0n, "0"],
    [999n, "999"],
    [1_000n, "1,000"],
    [38_357_692n, "38,357,692"],
    [123_456_789_012_345_678_901n, "123,456,789,012,345,678,901"],
    [-1_234_567n, "-1,234,567"],
  ])("formats %s as %s without losing precision", (value, expected) => {
    expect(groupDigits(value)).toBe(expected);
  });
});
