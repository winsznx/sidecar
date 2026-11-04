import { describe, expect, it } from "vitest";

import { isInsideDirectory, proofWriteRefusal } from "@/lib/dreamdex/evidence-guard";

const PROOF = "public/proof";

describe("isInsideDirectory", () => {
  it.each(["public/proof", "public/proof/", "./public/proof/fork", "public/proof/a/b"])("puts %s inside public/proof", (path) => {
    // #given / #when / #then
    expect(isInsideDirectory(path, PROOF)).toBe(true);
  });

  it.each(["public/proofs", "public", "/tmp/fork-proof", "public/proof/../other"])("keeps %s outside public/proof", (path) => {
    // #given / #when / #then
    expect(isInsideDirectory(path, PROOF)).toBe(false);
  });
});

describe("proofWriteRefusal", () => {
  it("refuses a local run writing into a subdirectory of the proof directory", () => {
    // #given / #when / #then
    expect(proofWriteRefusal({ outDir: "public/proof/fork", proofDir: PROOF, local: true, canonicalBlockMatches: true })).toMatch(/local node/);
  });

  it("refuses a remote run whose block the default RPC does not know", () => {
    // #given / #when / #then
    expect(proofWriteRefusal({ outDir: PROOF, proofDir: PROOF, local: false, canonicalBlockMatches: false })).toMatch(/differs/);
  });

  it("refuses when the block could not be compared", () => {
    // #given / #when / #then
    expect(proofWriteRefusal({ outDir: PROOF, proofDir: PROOF, local: false, canonicalBlockMatches: null })).toMatch(/could not confirm/);
  });

  it("accepts a remote run confirmed by the default RPC", () => {
    // #given / #when / #then
    expect(proofWriteRefusal({ outDir: PROOF, proofDir: PROOF, local: false, canonicalBlockMatches: true })).toBeNull();
  });

  it("allows a local run to write to a scratch directory", () => {
    // #given / #when / #then
    expect(proofWriteRefusal({ outDir: "/tmp/fork-proof", proofDir: PROOF, local: true, canonicalBlockMatches: null })).toBeNull();
  });
});
