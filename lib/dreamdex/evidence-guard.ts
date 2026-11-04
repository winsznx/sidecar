import { isAbsolute, relative, resolve } from "node:path";

export interface ProofWriteContext {
  /** Directory the record would be written to. */
  outDir: string;
  /** The directory the proof page lists as on-chain evidence. */
  proofDir: string;
  /** Any of the RPC, WebSocket or indexer URLs is a loopback host. */
  local: boolean;
  /** The mined block's hash matches the default Hideki RPC's hash for that block. `null` when it could not be compared. */
  canonicalBlockMatches: boolean | null;
}

export function isInsideDirectory(path: string, directory: string): boolean {
  const rel = relative(resolve(directory), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Why a record must not be written to `outDir`, or `null` when it may be. Anything under the proof directory is
 * presented as live evidence, so it only accepts records whose block the default Hideki RPC confirms.
 */
export function proofWriteRefusal(context: ProofWriteContext): string | null {
  if (!isInsideDirectory(context.outDir, context.proofDir)) return null;
  if (context.local) return "An RPC, WebSocket or indexer override points at a local node, so this record cannot go under the proof directory.";
  if (context.canonicalBlockMatches === null) return "The default Hideki RPC could not confirm the mined block, so this record cannot go under the proof directory.";
  if (!context.canonicalBlockMatches) return "The mined block's hash differs from the default Hideki RPC's, so this record is not live evidence.";
  return null;
}
