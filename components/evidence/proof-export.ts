import { NETWORK } from "@/lib/dreamdex/config";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import type { TimingSummary } from "@/lib/dreamdex/timing";
import { sanitizeEvidence } from "@/lib/evidence/proof-event";

import type { JourneyStatus, ProofRun } from "./journeys";
import type { LiveCheckRow } from "./live-checks";
import type { ProofIndexEntry } from "./proof-index";

export const PROOF_PAGE_EXPORT_SCHEMA = "sidecar.proof-page.v1";

export interface ProofExportInput {
  exportedAt: string;
  checks: readonly LiveCheckRow[];
  timing: readonly TimingSummary[];
  journeys: readonly JourneyStatus[];
  runs: readonly ProofRun[];
  /** `null` when the index could not be read, as distinct from an empty list. */
  records: readonly ProofIndexEntry[] | null;
}

/** The proof page's live checks and what the recorded evidence supports, as sanitized JSON. */
export function buildProofExport(input: ProofExportInput): string {
  const record = {
    schema: PROOF_PAGE_EXPORT_SCHEMA,
    kind: "fresh-read",
    exportedAt: input.exportedAt,
    network: { chainId: HIDEKI_CHAIN_ID, rpcUrl: NETWORK.rpcUrl, wsUrl: NETWORK.wsUrl, indexerUrl: NETWORK.indexerUrl },
    liveChecks: input.checks.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status,
      value: row.value,
      reason: row.reason,
      source: row.source,
    })),
    latencyMs: input.timing.map((row) => ({
      operation: row.operation,
      count: row.count,
      failures: row.failures,
      p50: Math.round(row.p50Ms),
      p95: Math.round(row.p95Ms),
      max: Math.round(row.maxMs),
    })),
    journeys: input.journeys.map((journey) => ({
      id: journey.id,
      status: journey.status,
      evidence: journey.evidence.map((entry) => entry.hash),
    })),
    runs: input.runs.map((run) => ({
      id: run.id,
      status: run.status,
      evidence: run.evidence.map((entry) => entry.hash),
    })),
    recordedExecutions: input.records === null ? null : input.records.map((entry) => ({ hash: entry.hash, outcome: entry.outcome, block: entry.block, capturedAt: entry.capturedAt })),
  };
  return `${JSON.stringify(sanitizeEvidence(record).value, null, 2)}\n`;
}
