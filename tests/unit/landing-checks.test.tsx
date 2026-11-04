import { describe, expect, it } from "vitest";

import { LANDING_CHECKS } from "@/components/landing/truth-checks";
import { buildTruthChecks, type TruthCheckInput } from "@/lib/dreamdex/adapter";

const SENDER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const POOL = "0x3333333333333333333333333333333333333333";
const BANK = "0x4444444444444444444444444444444444444444";

const INPUT: TruthCheckInput = {
  rpcChainId: 50383,
  txChainId: 50383,
  from: SENDER,
  to: POOL,
  market: null,
  expectedAccount: SENDER,
  expectedBank: BANK,
  poolBank: BANK,
  receiptStatus: "success",
  block: 1n,
  revertReason: null,
  calldata: null,
  intent: null,
  placement: null,
  filledQuantity: 0n,
  outcomeNote: null,
  outcome: "UNKNOWN",
  marginEvents: [],
  counterpart: OTHER,
};

describe("landing check list", () => {
  it("names the same checks, in the same order, as the receipt verifier", () => {
    // #given the checks a receipt actually runs
    const verifier = buildTruthChecks(INPUT).map(({ id, label }) => ({ id, label }));

    // #when / #then
    expect(LANDING_CHECKS.map(({ id, label }) => ({ id, label }))).toEqual(verifier);
    expect(LANDING_CHECKS).toHaveLength(10);
  });
});
