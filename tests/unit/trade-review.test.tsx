import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { executionAnnouncement, orderIdLabel } from "@/components/trade/execution-status";
import { confirmBlocker, previewValidity } from "@/components/trade/review-dialog";
import { isPendingPreviewIssue, RouteComparison } from "@/components/trade/route-comparison";
import { ctaBlocker, walletLine } from "@/components/trade/sign-bar";
import { CALCULATION_LABELS } from "@/components/trade/trade-copy";
import type { ExecutionController } from "@/hooks/use-execution";
import { quoteFailure } from "@/hooks/use-trade-comparison";
import { INITIAL_EXECUTION_STATE, isLocked, phaseCopy, type ExecutionState } from "@/lib/orders/lifecycle";
import { whyTheseNumbers } from "@/lib/risk/explanations";
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
} from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER, PRIMARY_QUOTE, SEPARATE_QUOTE } from "@/tests/fixtures/quotes.fixture";
import { verifiedOrderFixture } from "@/tests/fixtures/receipts.fixture";

afterEach(cleanup);

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

function controller(state: ExecutionState, overrides: Partial<ExecutionController> = {}): ExecutionController {
  const noop = async (): Promise<void> => undefined;
  return {
    state,
    copy: phaseCopy(state),
    nothingSent: null,
    refusal: null,
    checking: false,
    verified: null,
    verificationFailures: [],
    afterStateIssue: null,
    proof: null,
    recoveryNote: null,
    orphan: null,
    dismissOrphan: () => undefined,
    locked: isLocked(state),
    prepare: async () => null,
    confirm: noop,
    checkAgain: noop,
    reset: () => undefined,
    ...overrides,
  };
}

const READY: ExecutionState = {
  ...INITIAL_EXECUTION_STATE,
  phase: "READY",
  intent: BTC_ORDER,
  account: SEPARATE_ADDRESS,
  quote: SEPARATE_QUOTE,
};

const BASE_CTA = { hasPrimary: true, ticketIssue: null, selected: "separate" as const, executionLocked: false, executionHeadline: "Edit the order" };

describe("a failed preview read stays visibly failed", () => {
  it("shows Preview failed with its reason instead of Checking with the protocol", () => {
    const comparison = compare({ separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: null } });
    render(
      <RouteComparison
        comparison={comparison}
        placeholderReason=""
        selected={null}
        onSelect={() => undefined}
        nowMs={NOW_MS}
        quoteFailures={{ shared: null, separate: "The network did not answer in time." }}
        onRetryQuote={() => undefined}
      />,
    );
    const card = screen.getByTestId("route-card-separate");
    expect(within(card).getByText("Preview failed")).toBeInTheDocument();
    expect(within(card).queryByText("Checking with the protocol")).toBeNull();
    expect(within(card).getByText(/failed: The network did not answer in time\./)).toBeInTheDocument();
    expect(within(within(card).getByTestId("route-issues-separate")).queryByText(/is not available yet/)).toBeNull();
    expect(within(card).getByRole("button", { name: "Retry preview" })).toBeInTheDocument();
  });

  it("recognises the comparison's pending preview issue, so a failure can replace it", () => {
    const route = compare({ separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: null } }).routes.separate;
    expect(route.issues.some((issue) => isPendingPreviewIssue(route, issue))).toBe(true);
  });

  it("reports a failure only when the read has no result for this order", () => {
    expect(quoteFailure({ isError: true, error: Object.assign(new Error("timed out"), { name: "TimeoutError" }), data: undefined }, BTC_ORDER)).toMatch(
      /did not answer in time/,
    );
    expect(quoteFailure({ isError: true, error: new Error("x"), data: SEPARATE_QUOTE }, BTC_ORDER)).toBeNull();
    expect(quoteFailure({ isError: false, error: null, data: undefined }, BTC_ORDER)).toBeNull();
  });

  it("names the failure on the sign button", () => {
    const comparison = compare({ separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: null } });
    expect(ctaBlocker({ ...BASE_CTA, comparison, quoteFailure: "The network did not answer in time." })).toMatch(/^Preview failed:/);
  });
});

describe("route cards", () => {
  it("badges each as-read row with its own source, so the room estimate never sits under a chain badge", () => {
    render(<RouteComparison comparison={compare()} placeholderReason="" selected={null} onSelect={() => undefined} nowMs={NOW_MS} />);
    const rows = within(screen.getByTestId("route-card-shared")).getByText("As read now").nextElementSibling;
    if (!(rows instanceof HTMLElement)) throw new Error("The as-read rows are missing.");
    const room = within(rows).getByText("Room before maintenance").closest("div");
    expect(room?.textContent).toMatch(/EST/);
    expect(room?.textContent).not.toMatch(/CHAIN|SDK/);
    const equity = within(rows).getByText("Equity").closest("div");
    expect(equity?.textContent).toMatch(/CHAIN|SDK/);
  });

  it("labels unlocked collateral as before PnL and leads with the margin it locks", () => {
    render(<RouteComparison comparison={compare()} placeholderReason="" selected={null} onSelect={() => undefined} nowMs={NOW_MS} />);
    const card = screen.getByTestId("route-card-shared");
    expect(within(card).getByText("Unlocked collateral (before PnL)")).toBeInTheDocument();
    expect(within(card).queryByText("Free collateral")).toBeNull();
    expect(within(screen.getByTestId("route-headline-shared")).getByText("Margin locked")).toBeInTheDocument();
  });

  it("prints the separate-account trade-off once", () => {
    render(<RouteComparison comparison={compare()} placeholderReason="" selected={null} onSelect={() => undefined} nowMs={NOW_MS} />);
    expect(screen.getAllByText(/use capital less efficiently|less capital-efficient|its own collateral/i).length).toBeLessThanOrEqual(2);
  });

  it("maps every relabelled calculation row onto a row the sheet really has", () => {
    const fields = whyTheseNumbers(compare(), "shared").map((row) => row.field);
    for (const key of Object.keys(CALCULATION_LABELS)) expect(fields).toContain(key);
  });
});

describe("sign bar", () => {
  it("names a watch-only signer before a funding shortfall, since funding alone cannot fix it", () => {
    const comparison = compare({
      separate: { identity: { ...SEPARATE_IDENTITY, watchOnly: true }, snapshot: EMPTY_SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE },
      wallet: { address: null, chainId: null },
    });
    expect(ctaBlocker({ ...BASE_CTA, comparison })).toMatch(/^Account B is watch-only/);
  });

  it("keeps the mobile wallet line to one short phrase", () => {
    expect(walletLine(compare().routes.separate, SEPARATE_ADDRESS).text).toBe("B 0x0DE1…b1E0, ready");
    expect(walletLine(null, null).text).toBe("Not connected");
  });
});

describe("review dialog freshness", () => {
  it("reports the preview's age while it is inside the signing window", () => {
    const validity = previewValidity(controller(READY), Date.parse(SEPARATE_QUOTE.readAt) + 4_000);
    expect(validity).toEqual({ valid: true, ageMs: 4_000 });
  });

  it("blocks signing and says so once the preview is older than the window", () => {
    const comparison = compare();
    const stale = Date.parse(SEPARATE_QUOTE.readAt) + 25_000;
    expect(confirmBlocker({ comparison, kind: "separate", execution: controller(READY), hasWalletClient: true, nowMs: stale })).toMatch(
      /old\. Refresh it before signing/,
    );
    expect(
      confirmBlocker({ comparison, kind: "separate", execution: controller(READY), hasWalletClient: true, nowMs: Date.parse(SEPARATE_QUOTE.readAt) + 1_000 }),
    ).toBeUndefined();
  });
});

describe("execution status copy", () => {
  it("says Resting only when part of a GTC order is still on the book", () => {
    expect(orderIdLabel(verifiedOrderFixture())).toBe("Resting order id");
    expect(orderIdLabel(verifiedOrderFixture({ filledQuantity: BTC_ORDER.quantity }))).toBe("Order id");
    expect(
      orderIdLabel(verifiedOrderFixture({ requested: { side: "long", quantity: BTC_ORDER.quantity, price: BTC_ORDER.price, timeInForce: "IOC" } })),
    ).toBe("Order id");
  });

  it("announces rejections assertively and progress politely", () => {
    expect(executionAnnouncement(controller({ ...READY, phase: "WALLET_REJECTED" })).assertive).toBe("Signature declined. Nothing was sent.");
    expect(executionAnnouncement(controller({ ...READY, phase: "SUBMITTED", txHash: null })).polite).toBe("Submitted, waiting for the chain");
    expect(executionAnnouncement(controller(INITIAL_EXECUTION_STATE))).toEqual({ polite: "", assertive: "" });
  });
});
