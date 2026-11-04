import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReceiptLookupScreen } from "@/components/evidence/receipt-lookup-screen";
import type { ProofIndexLookup } from "@/hooks/use-proof-index";

import { TX_HASH } from "../fixtures/receipts.fixture";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const lookup = vi.hoisted(() => ({ current: { state: "loading" } as ProofIndexLookup }));
vi.mock("@/hooks/use-proof-index", () => ({
  useProofIndex: () => ({ lookup: lookup.current, reload: () => undefined, fetching: false }),
}));

const SENDER = "0xcC7F72954b83B51263De70d6e4011E595A144b3F";

afterEach(() => {
  cleanup();
  push.mockReset();
  lookup.current = { state: "loading" };
});

describe("ReceiptLookupScreen", () => {
  it("opens the receipt for a pasted hash", () => {
    // #given
    render(<ReceiptLookupScreen />);
    // #when
    fireEvent.change(screen.getByLabelText(/Transaction hash/), { target: { value: TX_HASH } });
    fireEvent.submit(screen.getByRole("button", { name: "Open receipt" }));
    // #then
    expect(push).toHaveBeenCalledWith(`/receipt/${TX_HASH.toLowerCase()}`);
  });

  it("explains a malformed hash in place and does not navigate", () => {
    // #given
    render(<ReceiptLookupScreen />);
    // #when
    fireEvent.change(screen.getByLabelText(/Transaction hash/), { target: { value: "0x1234" } });
    fireEvent.submit(screen.getByRole("button", { name: "Open receipt" }));
    // #then
    expect({ reason: screen.getByText("A transaction hash has 64 hex characters after 0x. This one has 4."), pushed: push.mock.calls.length }).toEqual({
      reason: expect.anything(),
      pushed: 0,
    });
  });

  it("lists each recorded run with a link to its receipt", () => {
    // #given
    lookup.current = {
      state: "ok",
      rejected: [],
      index: {
        schema: "sidecar.proof-index.v1",
        updatedAt: "2026-11-03T20:20:39.021Z",
        records: [
          {
            hash: TX_HASH,
            account: SENDER,
            sender: SENDER,
            selectedGiven: true,
            selectedRole: "B",
            counterpart: null,
            market: "BTC-PERP",
            outcome: "FILLED",
            block: "40833611",
            capturedAt: "2026-11-03T20:20:39.018Z",
            file: `${TX_HASH}.json`,
            chainId: 50383,
            canonical: true,
            checks: [{ id: "chain-id", status: "pass" }],
          },
        ],
      },
    };
    // #when
    render(<ReceiptLookupScreen />);
    // #then
    const runs = screen.getByRole("region", { name: "Recorded runs" });
    expect(within(runs).getByRole("link", { name: "Open receipt" })).toHaveAttribute("href", `/receipt/${TX_HASH}?account=${SENDER}`);
  });

  it("says nothing is recorded when the index is missing, instead of an empty list", () => {
    // #given
    lookup.current = { state: "missing" };
    // #when
    render(<ReceiptLookupScreen />);
    // #then
    expect(screen.getByText("No runs recorded yet")).toBeInTheDocument();
  });
});
