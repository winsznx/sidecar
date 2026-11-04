import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProofScreen } from "@/components/evidence/proof-screen";
import { ReceiptRecord } from "@/components/evidence/receipt-record";
import { InvalidHashRecord } from "@/components/evidence/receipt-states";
import { intentFromOrder } from "@/components/evidence/receipt-model";
import type { TruthCheck, VerifiedOrder } from "@/lib/dreamdex/types";
import type { ProofEvent } from "@/lib/evidence/proof-event";
import { intentHash } from "@/lib/orders/intent";
import { EMPTY_ACCOUNT_BOOK } from "@/lib/wallets/identity";

import { PRIMARY_ADDRESS, READ_AT, SEPARATE_ADDRESS } from "../fixtures/accounts.fixture";
import { BTC_PERP, BTC_POOL } from "../fixtures/markets.fixture";
import { fill, TX_HASH, verifiedOrderFixture } from "../fixtures/receipts.fixture";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/hooks/use-receipt-snapshots", () => ({
  useAccountAtBlocks: () => ({ before: { state: "loading" }, after: { state: "loading" } }),
}));

vi.mock("@/hooks/use-proof-checks", () => ({
  useProofLiveChecks: () => ({
    rows: [{ id: "chain-id", label: "RPC reports chain 50383", status: "loading", value: null, source: null, reason: null }],
    running: true,
    lastRunAt: null,
    runAgain: () => undefined,
  }),
  useAdapterTiming: () => [],
}));

vi.mock("@/hooks/use-sidecar-queries", () => ({
  useMarkets: () => ({ status: "pending", data: undefined, error: null }),
}));

vi.mock("@/hooks/use-receipt-reconcile", () => ({
  useReceiptReconcile: () => ({ lookup: { state: "loading" }, fetching: true, checkAgain: () => undefined }),
}));

vi.mock("@/hooks/use-proof-index", () => ({
  useProofIndex: () => ({ lookup: { state: "missing" }, reload: () => undefined, fetching: false }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const CORE = ["chain-id", "pool-listed", "margin-bank", "receipt-success", "placement-decoded", "position-attribution", "collateral-attribution"];

function checks(status: (id: string) => TruthCheck["status"]): TruthCheck[] {
  return [...CORE, "sender", "calldata-intent", "counterpart-isolation"].map((id) => ({
    id,
    label: `Check ${id}`,
    status: status(id),
    detail: `${id} detail`,
  }));
}

function filled(overrides: Partial<VerifiedOrder> = {}): VerifiedOrder {
  const quantity = BTC_PERP.minQuantity;
  return verifiedOrderFixture({
    outcome: "FILLED",
    orderId: null,
    requested: { side: "long", quantity, price: 77_412_300_000_000_000_000_000n, timeInForce: "IOC" },
    fills: [fill(quantity)],
    filledQuantity: quantity,
    checks: checks((id) => (CORE.includes(id) ? "pass" : "unknown")),
    ...overrides,
  });
}

function renderReceipt(order: VerifiedOrder): void {
  render(<ReceiptRecord order={order} markets={[BTC_PERP]} book={EMPTY_ACCOUNT_BOOK} expected={null} counterpart={null} captured={null} />);
}

function capturedFor(order: VerifiedOrder, overrides: Partial<ProofEvent> = {}): ProofEvent {
  const intent = intentFromOrder(order);
  if (intent === null) throw new Error("The fixture order must decode to an intent.");
  return {
    runId: "run-1",
    observedAtUtc: READ_AT,
    networkChainId: 50383,
    selectedAccount: SEPARATE_ADDRESS,
    counterpartAccount: PRIMARY_ADDRESS,
    marketPool: BTC_POOL,
    orderIntentHash: intentHash(intent, SEPARATE_ADDRESS, 50383),
    txHash: TX_HASH,
    previewStatus: "verified",
    ...overrides,
  };
}

function renderCaptured(order: VerifiedOrder, captured: ProofEvent): void {
  render(
    <ReceiptRecord
      order={order}
      markets={[BTC_PERP]}
      book={EMPTY_ACCOUNT_BOOK}
      expected={{ account: captured.selectedAccount, origin: "captured" }}
      counterpart={captured.counterpartAccount}
      captured={captured}
    />,
  );
}

const CALLDATA = {
  isBid: true,
  userData: 0n,
  price: 1n,
  quantity: 1n,
  expireTimestampNs: 0n,
  orderType: 2,
  selfMatchingOption: 0,
  builder: SEPARATE_ADDRESS,
  builderFeeBpsTimes1k: 0n,
};

describe("ReceiptRecord", () => {
  it("stamps VERIFIED only when sender, other account and prepared order were all compared and passed", () => {
    // #given a receipt opened in the browser that sent it
    const order = filled({ calldata: CALLDATA, checks: checks((id) => (id === "calldata-intent" ? "unknown" : "pass")) });
    // #when
    renderCaptured(order, capturedFor(order));
    // #then
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("never stamps VERIFIED when there is no selected account to compare the sender with", () => {
    // #given a stranger's public fill: every chain check passed
    const order = filled();
    // #when
    renderReceipt(order);
    // #then
    expect({ verified: screen.queryByText("Verified"), tag: screen.getByText("Receipt checks pass"), qualifier: screen.getByText(/Sender not compared/) }).toEqual({
      verified: null,
      tag: expect.anything(),
      qualifier: expect.anything(),
    });
  });

  it("shows unchecked context rows as Not compared, never as Unknown", () => {
    // #given
    const order = filled();
    // #when
    renderReceipt(order);
    // #then
    expect({ notCompared: screen.getAllByText("Not compared").length, unknown: screen.queryAllByText("Unknown").length }).toEqual({ notCompared: 3, unknown: 0 });
  });

  it("names the market, side and sender in the header", () => {
    // #given
    const order = filled();
    // #when
    renderReceipt(order);
    // #then
    expect({ title: screen.getByRole("heading", { level: 1 }).textContent, sentBy: screen.getByText("Sent by") }).toEqual({
      title: "BTC-PERP long filled",
      sentBy: expect.anything(),
    });
  });

  it("explains a decoded revert in plain words and raises no duplicate calldata alert", () => {
    // #given a reverted call whose calldata is not a placement
    const order = verifiedOrderFixture({
      receiptStatus: "reverted",
      outcome: "REVERTED",
      orderId: null,
      revertReason: "MaxPositionSizeExceeded",
      calldata: null,
      checks: checks((id) => (id === "chain-id" ? "pass" : id === "receipt-success" || id === "calldata-intent" ? "fail" : "unknown")),
    });
    // #when
    renderReceipt(order);
    // #then
    expect({
      plain: screen.getAllByText(/past the market's per-account position cap/).length > 0,
      failedAlert: screen.queryByText("A check failed"),
      notPlacement: screen.getByText("This is not a perp order placement"),
      unknown: screen.queryAllByText("Unknown").length,
    }).toEqual({ plain: true, failedAlert: null, notPlacement: expect.anything(), unknown: 0 });
  });

  it("shows a captured partial position read as unavailable, never as None", () => {
    // #given the positions read failed when the trade screen captured the account
    const order = filled({ calldata: CALLDATA });
    const state = {
      account: SEPARATE_ADDRESS,
      block: "300419",
      readAt: READ_AT,
      readStatus: "partial",
      margin: { unlockedCollateral: "1", lockedCollateral: "0", equity: "1", mmReq: "0", imReq: "0", status: "Healthy" },
      positions: [],
      gasBalance: "1",
      issues: ["Positions unavailable: the read timed out."],
    };
    // #when
    renderCaptured(order, capturedFor(order, { beforeAccountState: state, afterAccountState: { ...state, block: "300420" } }));
    // #then
    const accounts = within(screen.getByRole("region", { name: "Account before and after" }));
    expect({ none: accounts.queryByText("None"), issue: accounts.getAllByText("Positions unavailable: the read timed out.").length > 0 }).toEqual({
      none: null,
      issue: true,
    });
  });

  it("shows no VERIFIED stamp when a check failed", () => {
    // #given
    const order = filled({ checks: checks((id) => (id === "collateral-attribution" ? "fail" : CORE.includes(id) ? "pass" : "unknown")) });
    // #when
    renderReceipt(order);
    // #then
    expect({ verified: screen.queryByText("Verified"), notVerified: screen.getByText("Not verified") }).toEqual({
      verified: null,
      notVerified: expect.anything(),
    });
  });

  it("marks unknown checks on a reverted order as not applicable", () => {
    // #given
    const order = verifiedOrderFixture({
      receiptStatus: "reverted",
      outcome: "REVERTED",
      orderId: null,
      revertReason: "ImmediateOrCancelNoFill",
      revertSource: "parent-block-replay",
      checks: checks((id) => (id === "chain-id" ? "pass" : id === "receipt-success" ? "fail" : "unknown")),
    });
    // #when
    renderReceipt(order);
    // #then
    expect(screen.getAllByText("Not applicable after a revert.")).toHaveLength(8);
  });

  it("states the explorer's perp size caveat next to its link", () => {
    // #given
    const order = filled();
    // #when
    renderReceipt(order);
    // #then
    expect(screen.getByText(/The explorer may show size 0 for perp orders/)).toBeInTheDocument();
  });
});

describe("InvalidHashRecord", () => {
  it("names the problem and says nothing was looked up", () => {
    // #given
    const reason = "A transaction hash starts with 0x.";
    // #when
    render(<InvalidHashRecord raw="1234" reason={reason} />);
    // #then
    expect(screen.getByText(`${reason} Sidecar did not look anything up.`)).toBeInTheDocument();
  });
});

describe("ProofScreen with nothing recorded", () => {
  it("shows every journey as not yet recorded", () => {
    // #given no proof index has been published
    // #when
    render(<ProofScreen />);
    // #then
    expect(screen.getAllByText("Not yet recorded")).toHaveLength(3);
  });

  it("keeps the live-check list out of any live region and announces only the summary", () => {
    // #given
    // #when
    const { container } = render(<ProofScreen />);
    // #then
    expect({ live: container.querySelectorAll("[aria-live]").length, status: screen.getAllByRole("status").some((node) => node.textContent === "Reading") }).toEqual({
      live: 0,
      status: true,
    });
  });

  it("explains an invalid hash in the open-receipt form and does not navigate", () => {
    // #given
    render(<ProofScreen />);
    // #when
    fireEvent.change(screen.getByLabelText(/Transaction hash/), { target: { value: "0x1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Open receipt" }));
    // #then
    expect({ reason: screen.getByText("A transaction hash has 64 hex characters after 0x. This one has 4."), pushed: push.mock.calls.length }).toEqual({
      reason: expect.anything(),
      pushed: 0,
    });
  });

  it("opens the receipt for a valid hash", () => {
    // #given
    render(<ProofScreen />);
    // #when
    fireEvent.change(screen.getByLabelText(/Transaction hash/), { target: { value: TX_HASH.toUpperCase().replace("0X", "0x") } });
    fireEvent.submit(screen.getByRole("button", { name: "Open receipt" }));
    // #then
    expect(push).toHaveBeenCalledWith(`/receipt/${TX_HASH.toLowerCase()}`);
  });

  it("says what each unrecorded run's receipt will have to show, with no maintainer commands", () => {
    // #given no proof index has been published
    // #when
    render(<ProofScreen />);
    // #then
    expect({
      explained: screen.getAllByText("Its receipt will have to show").length,
      noReceipt: screen.getAllByText("No receipt yet").length,
      command: screen.queryByText(/npm run evidence:capture/),
    }).toEqual({ explained: 3, noReceipt: 3, command: null });
  });

  it("labels the decoded public fill as another trader's, never as Sidecar's run", () => {
    // #given no proof index has been published
    // #when
    render(<ProofScreen />);
    // #then
    expect({
      title: screen.getByRole("heading", { name: "A real fill on Hideki, decoded" }),
      owner: screen.getByText("Placed by another trader, not by Sidecar."),
      plate: screen.getByText("Sidecar's own run, not recorded"),
    }).toEqual({ title: expect.anything(), owner: expect.anything(), plate: expect.anything() });
  });

  it("never implies a live run happened when nothing is recorded", () => {
    // #given no proof index has been published
    // #when
    render(<ProofScreen />);
    // #then
    expect({
      lede: screen.getByText(/Sidecar hasn't recorded a live run on Hideki yet/),
      recorded: screen.queryByText("Recorded run"),
    }).toEqual({ lede: expect.anything(), recorded: null });
  });
});
