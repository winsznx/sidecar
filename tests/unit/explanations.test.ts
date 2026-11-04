import { describe, expect, it } from "vitest";

import { phaseCopy, transition, INITIAL_EXECUTION_STATE, type ExecutionEvent } from "@/lib/orders/lifecycle";
import {
  eligibilityCopy,
  explainComparison,
  explainRoute,
  placeButtonLabel,
  SEPARATE_TRADEOFF,
  whyTheseNumbers,
  type InsufficientCollateralVariant,
} from "@/lib/risk/explanations";
import { buildComparison } from "@/lib/risk/preview";
import type { Comparison, ComparisonInput } from "@/lib/risk/types";
import {
  EMPTY_SEPARATE_SNAPSHOT,
  NOW_MS,
  PRIMARY_IDENTITY,
  PRIMARY_SNAPSHOT,
  SEPARATE_ADDRESS,
  SEPARATE_IDENTITY,
  SEPARATE_SNAPSHOT,
  snapshotFixture,
} from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP, usdso } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER, patchQuote, PRIMARY_QUOTE, SEPARATE_QUOTE } from "@/tests/fixtures/quotes.fixture";

function compare(overrides: Partial<ComparisonInput> = {}): Comparison {
  return buildComparison({
    market: BTC_PERP,
    intent: BTC_ORDER,
    primary: { identity: PRIMARY_IDENTITY, snapshot: PRIMARY_SNAPSHOT, quote: PRIMARY_QUOTE },
    separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE },
    wallet: { address: SEPARATE_ADDRESS, chainId: 50383 },
    nowMs: NOW_MS,
    ...overrides,
  });
}

function allCopy(comparison: Comparison): string[] {
  const explained = explainComparison(comparison);
  const routes = [explained.shared, explained.separate];
  const kinds = ["shared", "separate"] as const;
  return [
    ...routes.flatMap((route) => [
      route.title,
      route.headline,
      route.status,
      ...route.points,
      ...route.blockers.flatMap((copy) => [copy.message, copy.nextStep]),
      ...route.warnings.flatMap((copy) => [copy.message, copy.nextStep]),
    ]),
    ...explained.tradeoff,
    ...kinds.flatMap((kind) => whyTheseNumbers(comparison, kind).flatMap((row) => [row.field, row.value, row.detail])),
    ...kinds.map((kind) => placeButtonLabel(comparison, kind)),
  ];
}

const VARIED_COMPARISONS: Comparison[] = [
  compare(),
  compare({ separate: null }),
  compare({ wallet: { address: null, chainId: null } }),
  compare({ nowMs: NOW_MS + 60_000 }),
  compare({ separate: { identity: SEPARATE_IDENTITY, snapshot: EMPTY_SEPARATE_SNAPSHOT, quote: patchQuote(SEPARATE_QUOTE, { priceable: false, markPrice: null }) } }),
  compare({
    separate: {
      identity: SEPARATE_IDENTITY,
      snapshot: SEPARATE_SNAPSHOT,
      quote: patchQuote(SEPARATE_QUOTE, {
        margin: { voucherBlocked: true, hasCollateralForLock: false, sufficient: false, mainWalletPull: usdso(0n, 30n), fundingPayer: PRIMARY_IDENTITY.address },
        maxSize: { maxQuantity: 0n, placeable: false, limitedBy: "voucherBlocked" },
      }),
    },
  }),
];

describe("route explanations", () => {
  it("says BTC on the primary account shares collateral with the ETH position", () => {
    // #given account A with an ETH long
    // #when the shared route is explained
    const { headline } = explainRoute(compare(), "shared");
    // #then it names the shared collateral plainly
    expect(headline).toBe("BTC on this account shares collateral with your existing ETH position.");
  });

  it("says BTC in the second wallet uses a different margin balance", () => {
    // #given a separately funded second wallet
    // #when the separate route is explained
    const { headline } = explainRoute(compare(), "separate");
    // #then it says the margin balance is different
    expect(headline).toBe("BTC in your second wallet uses a different margin balance.");
  });

  it("states the capital-efficiency trade-off and that separate margin can still be liquidated", () => {
    // #given the separate route
    // #when it is explained
    const { points } = explainRoute(compare(), "separate");
    // #then the cost and the limit of separation are both stated
    expect(points).toEqual(
      expect.arrayContaining([SEPARATE_TRADEOFF, "A position here can still be liquidated, against this wallet's own margin."]),
    );
  });

  it("explains that losses offset inside the shared account", () => {
    // #given the shared route with an existing position
    // #when it is explained
    const { points } = explainRoute(compare(), "shared");
    // #then netting is acknowledged both ways
    expect(points[0]).toBe(
      "Gains and losses on these positions offset each other in one account, and a loss on one can use collateral that backs the others.",
    );
  });

  it("puts the primary's unused collateral beside what the second wallet must post", () => {
    // #given A could fund the order itself
    // #when the trade-off is explained
    const { tradeoff } = explainComparison(compare());
    // #then both amounts are stated
    expect(tradeoff).toEqual([
      SEPARATE_TRADEOFF,
      "Your primary account has 1,000.00 USDso free, but the second wallet must post its own 0.50 USDso for this order.",
    ]);
  });

  it("reports an unpriceable market in the words the trader sees", () => {
    // #given an unpriceable separate preview
    const comparison = compare({
      separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: patchQuote(SEPARATE_QUOTE, { priceable: false, markPrice: null }) },
    });
    // #when the separate route is explained
    const { blockers } = explainRoute(comparison, "separate");
    // #then the first blocker is the price feed
    expect(blockers[0]?.message).toBe("Preview unavailable: the protocol cannot currently price this market.");
  });

  it("discloses another wallet's funds before signing", () => {
    // #given the primary's wallet funding 0.30 USDso of the second wallet's order
    const comparison = compare({
      separate: {
        identity: SEPARATE_IDENTITY,
        snapshot: SEPARATE_SNAPSHOT,
        quote: patchQuote(SEPARATE_QUOTE, {
          margin: { topUpRequired: usdso(0n, 30n), mainWalletPull: usdso(0n, 30n), fundingPayer: PRIMARY_IDENTITY.address },
        }),
      },
    });
    // #when the separate route is explained
    const { points } = explainRoute(comparison, "separate");
    // #then the movement and whose wallet it is are both spelled out
    expect(points).toEqual(
      expect.arrayContaining([
        "Placing this order moves 0.30 USDso from 0xf075…dcd0 into this account's margin.",
        "That wallet is your primary account. Its margin balance is not used, but its wallet funds move.",
      ]),
    );
  });

  it("names the account in the place button", () => {
    // #given both routes
    // #when the button labels are formed
    const labels = [placeButtonLabel(compare(), "separate"), placeButtonLabel(compare({ separate: null }), "separate")];
    // #then each names exactly where the trade goes
    expect(labels).toEqual(["Place BTC trade in 0x0DE1…b1E0", "Add a second wallet"]);
  });

  it("describes an empty primary without inventing exposure", () => {
    // #given a primary account with no positions
    const snapshot = snapshotFixture({ account: PRIMARY_IDENTITY.address });
    const comparison = compare({ primary: { identity: PRIMARY_IDENTITY, snapshot, quote: PRIMARY_QUOTE } });
    // #when the shared route is explained
    const { headline } = explainRoute(comparison, "shared");
    // #then it says there is nothing to share with
    expect(headline).toBe("This account has no open positions, so nothing shares collateral with BTC yet.");
  });
});

describe("why these numbers", () => {
  it("lists every figure with its source kind and block", () => {
    // #given the separate route
    // #when its breakdown is produced
    const rows = whyTheseNumbers(compare(), "separate");
    // #then chain reads, SDK calculations and Sidecar estimates are each labelled
    expect(
      Object.fromEntries(
        rows
          .filter((row) => ["Equity before", "Margin this order locks", "Buffer if the order fills"].includes(row.field))
          .map((row) => [row.field, [row.sourceLabel, row.block]]),
      ),
    ).toEqual({
      "Equity before": ["Chain read", SEPARATE_SNAPSHOT.block],
      "Margin this order locks": ["SDK calculation", SEPARATE_QUOTE.block],
      "Buffer if the order fills": ["Sidecar estimate", SEPARATE_QUOTE.block],
    });
  });

  it("shows unavailable figures with their reason, never as zero", () => {
    // #given an empty second wallet whose buffer does not apply
    const comparison = compare({ separate: { identity: SEPARATE_IDENTITY, snapshot: EMPTY_SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE } });
    // #when its breakdown is produced
    const buffer = whyTheseNumbers(comparison, "separate").find((row) => row.field === "Buffer before");
    // #then it reads as unavailable with the reason
    expect([buffer?.value, buffer?.available, buffer?.detail]).toEqual([
      "Unavailable",
      false,
      "No maintenance requirement to cover: no open positions.",
    ]);
  });
});

describe("copy hygiene", () => {
  const lifecycleCopy = (() => {
    const events: ExecutionEvent[] = [
      { type: "QUOTE_REQUESTED", intent: BTC_ORDER, account: SEPARATE_ADDRESS },
      { type: "QUOTE_READY", quote: SEPARATE_QUOTE },
      { type: "SIGN_REQUESTED", intent: BTC_ORDER, account: SEPARATE_ADDRESS, signer: { address: SEPARATE_ADDRESS, chainId: 50383 }, nowMs: NOW_MS },
      { type: "OUTCOME_UNKNOWN", hash: null },
    ];
    let state = INITIAL_EXECUTION_STATE;
    const copy: string[] = [];
    for (const event of events) {
      state = transition(state, event).state;
      const { headline, detail } = phaseCopy(state);
      copy.push(headline, detail ?? "");
    }
    return copy;
  })();
  const everything = [...VARIED_COMPARISONS.flatMap(allCopy), ...lifecycleCopy];

  it("uses no em or en dashes anywhere", () => {
    // #given every sentence the comparison and lifecycle can produce for varied states
    // #when scanned for dashes
    const offenders = everything.filter((text) => /[\u2013\u2014]/.test(text));
    // #then there are none
    expect(offenders).toEqual([]);
  });

  it("never claims protection, prevention or guarantees", () => {
    // #given the same sentences
    // #when scanned for forbidden product claims
    const offenders = everything.filter((text) =>
      /prevents? liquidation|guarantee|keeps your portfolio safe|protected|instantly isolates|recommended/i.test(text),
    );
    // #then none makes a claim the system cannot back
    expect(offenders).toEqual([]);
  });

  it("never sends funds through another app's account or a smart wallet", () => {
    // #given the sentences above plus every collateral and gas shortfall wording
    const variants: InsufficientCollateralVariant[] = [
      "lock",
      "collateral",
      "walletBalance",
      "walletAllowance",
      "mainWallet",
      "walletTopUp",
      "rejected",
    ];
    const shortfallCopy = [
      ...variants.map((variant) =>
        eligibilityCopy({ code: "INSUFFICIENT_COLLATERAL", market: BTC_PERP, variant, shortfall: usdso(1n) }),
      ),
      eligibilityCopy({ code: "NO_GAS", balance: 0n, required: 1n }),
    ].flatMap((copy) => [copy.message, copy.nextStep ?? ""]);
    // #when scanned for guidance that moves funds out of the trader's own wallet setup
    const offenders = [...everything, ...shortfallCopy].filter((text) =>
      /official app|app account|smart wallet/i.test(text),
    );
    // #then all funding guidance points at the wallet itself
    expect(offenders).toEqual([]);
  });

  it("never prints a zero for a figure that could not be read", () => {
    // #given every "Why these numbers?" row across varied states
    const rows = VARIED_COMPARISONS.flatMap((comparison) => [
      ...whyTheseNumbers(comparison, "shared"),
      ...whyTheseNumbers(comparison, "separate"),
    ]);
    // #when unavailable rows are inspected
    const zeroes = rows.filter((row) => !row.available && /\d/.test(row.value));
    // #then none shows a number
    expect(zeroes).toEqual([]);
  });
});
