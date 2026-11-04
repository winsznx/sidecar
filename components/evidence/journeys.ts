import type { PlacementOutcome } from "@/lib/dreamdex/types";

import { checkStatus, type ProofIndexEntry } from "./proof-index";

export type JourneyId = "J1" | "J2" | "J3";

export interface JourneyStatus {
  id: JourneyId;
  title: string;
  /** What a person does and sees on this journey. */
  steps: string;
  status: "recorded" | "not-recorded";
  /** Records that show this journey, newest first. */
  evidence: ProofIndexEntry[];
  /** What would count as evidence, or why none can exist yet. */
  requirement: string;
}

const PLACED: readonly PlacementOutcome[] = ["FILLED", "PARTIALLY_FILLED", "RESTING"];
const HONEST_FAILURE: readonly PlacementOutcome[] = ["REVERTED", "NO_FILL"];

function noFailedChecks(entry: ProofIndexEntry): boolean {
  return entry.checks.every((check) => check.status !== "fail" || (entry.outcome === "REVERTED" && check.id === "receipt-success"));
}

/**
 * An order signed from the separate account B whose record proves B sent it and that account A,
 * its counterpart, did not fund it. An order from A, or one with no named roles, never counts.
 */
export function showsSeparation(entry: ProofIndexEntry): boolean {
  return (
    entry.selectedGiven &&
    entry.selectedRole === "B" &&
    entry.counterpart !== null &&
    entry.counterpart.toLowerCase() !== entry.account.toLowerCase() &&
    PLACED.includes(entry.outcome) &&
    checkStatus(entry, "sender") === "pass" &&
    checkStatus(entry, "counterpart-isolation") === "pass" &&
    checkStatus(entry, "chain-id") === "pass" &&
    noFailedChecks(entry)
  );
}

/** A real order from the selected account that the chain refused or that found no fill. */
export function showsHonestFailure(entry: ProofIndexEntry): boolean {
  return (
    entry.selectedGiven &&
    HONEST_FAILURE.includes(entry.outcome) &&
    checkStatus(entry, "sender") === "pass" &&
    checkStatus(entry, "chain-id") === "pass" &&
    noFailedChecks(entry)
  );
}

/**
 * Journey status comes only from recorded evidence. With no matching record a journey reads
 * "Not yet recorded", whatever the app can do today.
 */
export function deriveJourneys(entries: readonly ProofIndexEntry[]): JourneyStatus[] {
  const j1 = entries.filter(showsSeparation);
  const j3 = entries.filter(showsHonestFailure);
  return [
    {
      id: "J1",
      title: "A trade in its own margin",
      steps:
        "An order is signed from the separate account B instead of the shared account A. The receipt shows B sent it, and none of A's collateral was locked or moved for it.",
      status: j1.length > 0 ? "recorded" : "not-recorded",
      evidence: j1,
      requirement:
        "Needs a captured order signed from account B that filled or rested, with the sender check and the account A check both passing.",
    },
    {
      id: "J2",
      title: "A separate account that cannot take the trade",
      steps:
        "Account B has no deposited USDso, or cannot open the market. The separate route is disabled with the exact cause, and nothing is sent from account A instead.",
      status: "not-recorded",
      evidence: [],
      requirement:
        "This journey sends no transaction, so a receipt record cannot show it. Sidecar has no recorded run of it yet.",
    },
    {
      id: "J3",
      title: "An honest failure",
      steps:
        "An order is rejected on chain or finds no fill. The receipt says so plainly and keeps the decoded reason.",
      status: j3.length > 0 ? "recorded" : "not-recorded",
      evidence: j3,
      requirement:
        "Needs a captured order from the selected account that reverted or found no fill. A dismissed wallet prompt sends nothing and leaves no record.",
    },
  ];
}

export type ProofRunId = "shared-a" | "separate-b" | "a-unchanged";

export interface ProofRun {
  id: ProofRunId;
  /** Position in the live run: A trades first, then B, then A is read again. */
  step: 1 | 2 | 3;
  title: string;
  /** The account whose state the run is about. */
  account: "A" | "B";
  /** What the run is, in one or two sentences. */
  summary: string;
  /** What the receipt has to show for the run to count. */
  shows: readonly string[];
  /** The same requirement as one sentence, finishing "Its receipt will have to show". */
  counts: string;
  /** Checks a record must pass, all of them, for the run to count. The card lists them in this order. */
  checkIds: readonly string[];
  status: "recorded" | "not-recorded";
  /** Records that show this run, newest first. */
  evidence: ProofIndexEntry[];
}

function placedFrom(entry: ProofIndexEntry, role: "A" | "B", market: string): boolean {
  return (
    entry.selectedGiven &&
    entry.selectedRole === role &&
    entry.counterpart !== null &&
    entry.market === market &&
    PLACED.includes(entry.outcome) &&
    checkStatus(entry, "sender") === "pass" &&
    checkStatus(entry, "chain-id") === "pass" &&
    noFailedChecks(entry)
  );
}

function passesAll(entry: ProofIndexEntry, checkIds: readonly string[]): boolean {
  return checkIds.every((id) => checkStatus(entry, id) === "pass");
}

const SHARED_A_CHECKS = ["sender", "pool-listed", "collateral-attribution"] as const;
const SEPARATE_B_CHECKS = ["sender", "pool-listed", "collateral-attribution"] as const;
const A_UNCHANGED_CHECKS = ["counterpart-isolation", "collateral-attribution", "position-attribution"] as const;

/**
 * The three runs the live demo has to show. A run reads recorded only when one captured record
 * passes every check its card lists; an unknown or missing check never counts. A record for
 * another market or account never stands in for a run.
 */
export function deriveProofRuns(entries: readonly ProofIndexEntry[]): ProofRun[] {
  const sharedA = entries.filter((entry) => placedFrom(entry, "A", "ETH-PERP") && passesAll(entry, SHARED_A_CHECKS));
  const separateB = entries.filter((entry) => placedFrom(entry, "B", "BTC-PERP") && passesAll(entry, SEPARATE_B_CHECKS));
  // "A unchanged" is about B's BTC trade, so only a record that already proves run 02 can prove it.
  const unchanged = separateB.filter((entry) => showsSeparation(entry) && passesAll(entry, A_UNCHANGED_CHECKS));
  return [
    {
      id: "shared-a",
      step: 1,
      title: "Shared margin: ETH order in account A",
      account: "A",
      summary: "The ETH-PERP order goes into account A's one margin account, the collateral every position in A shares.",
      shows: ["Sent by account A", "Placed on the ETH-PERP pool", "Margin locked in A's shared margin account"],
      counts: "account A as the sender, the ETH-PERP pool as the target, and margin locked in A's shared margin account.",
      checkIds: SHARED_A_CHECKS,
      status: sharedA.length > 0 ? "recorded" : "not-recorded",
      evidence: sharedA,
    },
    {
      id: "separate-b",
      step: 2,
      title: "Separate margin: BTC order in account B",
      account: "B",
      summary: "The BTC-PERP order goes to a second wallet with its own deposit, so it never touches A's collateral.",
      shows: ["Sent by account B", "Placed on the BTC-PERP pool", "Margin locked in B only"],
      counts: "account B as the sender, the BTC-PERP pool as the target, and margin locked in B only.",
      checkIds: SEPARATE_B_CHECKS,
      status: separateB.length > 0 ? "recorded" : "not-recorded",
      evidence: separateB,
    },
    {
      id: "a-unchanged",
      step: 3,
      title: "A unchanged by B's trade",
      account: "A",
      summary: "Account A is read before and after B's order is mined. Its collateral and positions have to match.",
      shows: ["B's order names A as the other account", "No collateral locked or moved in A", "B's position belongs to B"],
      counts: "A named as the other account on B's order, no collateral locked or moved in A, and B's position owned by B.",
      checkIds: A_UNCHANGED_CHECKS,
      status: unchanged.length > 0 ? "recorded" : "not-recorded",
      evidence: unchanged,
    },
  ];
}
