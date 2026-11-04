import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseProofIndex, PROOF_INDEX_FILE, type ProofIndexEntry } from "@/components/evidence/proof-index";

import { landingRecords, type LandingRecords } from "./recorded-runs-model";

const PROOF_DIR = join(process.cwd(), "public", "proof");

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(PROOF_DIR, file), "utf8"));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads public/proof on the server while the page renders. The files only change when a run is
 * captured and committed, so a synchronous read is a predictable value and lands in the static
 * shell; no request data is involved.
 */
export function readRecordedRuns(): LandingRecords {
  let raw: unknown;
  try {
    raw = readJson(PROOF_INDEX_FILE);
  } catch (error) {
    return { state: "unavailable", reason: `The record list could not be read (${describe(error)}).` };
  }
  return landingRecords(parseProofIndex(raw), (entry: ProofIndexEntry) => {
    try {
      return readJson(entry.file);
    } catch (error) {
      console.warn(`Landing: record ${entry.file} could not be read: ${describe(error)}`);
      return null;
    }
  });
}
