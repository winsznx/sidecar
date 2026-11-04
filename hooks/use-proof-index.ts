"use client";

import { useQuery } from "@tanstack/react-query";

import { parseProofIndex, PROOF_INDEX_FILE, type ProofIndex } from "@/components/evidence/proof-index";
import { classifyError } from "@/lib/dreamdex/errors";

import { sidecarKeys } from "./use-sidecar-queries";

export const PROOF_INDEX_URL = `/proof/${PROOF_INDEX_FILE}`;

export type ProofIndexLookup =
  | { state: "loading" }
  /** No index has been published yet: nothing was captured. */
  | { state: "missing" }
  | { state: "invalid"; reason: string }
  | { state: "error"; reason: string }
  | { state: "ok"; index: ProofIndex; rejected: { position: number; reason: string }[] };

type Fetched =
  | { state: "missing" }
  | { state: "invalid"; reason: string }
  | { state: "ok"; index: ProofIndex; rejected: { position: number; reason: string }[] };

async function fetchProofIndex(): Promise<Fetched> {
  const response = await fetch(PROOF_INDEX_URL, { cache: "no-store", headers: { accept: "application/json" } });
  if (response.status === 404) return { state: "missing" };
  if (!response.ok) throw new Error(`The proof index answered HTTP ${response.status}.`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { state: "invalid", reason: "The proof index is not valid JSON." };
  }
  const parsed = parseProofIndex(body);
  return parsed.ok ? { state: "ok", index: parsed.index, rejected: parsed.rejected } : { state: "invalid", reason: parsed.reason };
}

/** The recorded executions published next to the app. A missing file is a real state, not an error. */
export function useProofIndex(): { lookup: ProofIndexLookup; reload: () => void; fetching: boolean } {
  const query = useQuery({
    queryKey: [...sidecarKeys.all, "proof-index"] as const,
    queryFn: fetchProofIndex,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const reload = (): void => {
    void query.refetch();
  };
  if (query.status === "success") return { lookup: query.data, reload, fetching: query.isFetching };
  if (query.status === "error") return { lookup: { state: "error", reason: classifyError(query.error).message }, reload, fetching: query.isFetching };
  return { lookup: { state: "loading" }, reload, fetching: query.isFetching };
}
