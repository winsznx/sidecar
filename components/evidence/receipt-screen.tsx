"use client";

import type { ReactNode } from "react";
import type { Address, Hash } from "viem";

import { InlineAlert } from "@/components/ui/inline-alert";
import { useAccountBook } from "@/hooks/use-account-book";
import { useReceiptReconcile } from "@/hooks/use-receipt-reconcile";
import { useCapturedProof } from "@/hooks/use-receipt-snapshots";
import { useMarkets } from "@/hooks/use-sidecar-queries";
import { classifyError } from "@/lib/dreamdex/errors";

import { ReceiptRecord } from "./receipt-record";
import { parseAccountParam, parseTxHashParam, type ExpectedAccountOrigin } from "./receipt-model";
import { InvalidHashRecord, NotFoundRecord, PendingRecord, ReadFailedRecord, ReceiptSkeleton } from "./receipt-states";

export interface ReceiptScreenProps {
  /** The route segment exactly as it arrived. */
  rawHash: string;
  /** `?account=`, the account the link says sent this order. */
  linkAccount: string | null;
  /** `?counterpart=`, the other account in the comparison the link was recorded with. */
  linkCounterpart?: string | null;
}

/** Validates the hash first: a malformed one renders its reason and never reaches the network. */
export function ReceiptScreen({ rawHash, linkAccount, linkCounterpart = null }: ReceiptScreenProps): ReactNode {
  const parsed = parseTxHashParam(rawHash);
  if (!parsed.ok) return <InvalidHashRecord raw={rawHash} reason={parsed.reason} />;
  return (
    <ReceiptLoader
      key={parsed.hash}
      hash={parsed.hash}
      linkAccount={parseAccountParam(linkAccount)}
      linkCounterpart={parseAccountParam(linkCounterpart)}
    />
  );
}

function ReceiptLoader({ hash, linkAccount, linkCounterpart }: { hash: Hash; linkAccount: Address | null; linkCounterpart: Address | null }): ReactNode {
  const markets = useMarkets();
  const captured = useCapturedProof(hash);
  const { book } = useAccountBook();

  const capturedEvent = captured.status === "ok" ? captured.event : null;
  const expected: { account: Address; origin: ExpectedAccountOrigin } | null = capturedEvent
    ? { account: capturedEvent.selectedAccount, origin: "captured" }
    : linkAccount
      ? { account: linkAccount, origin: "link" }
      : null;
  // A link names a counterpart only together with the account it was compared against.
  const counterpart = capturedEvent?.counterpartAccount ?? (linkAccount !== null ? linkCounterpart : null);

  const { lookup, fetching, checkAgain } = useReceiptReconcile({
    hash,
    markets: markets.data,
    expectedAccount: expected?.account ?? null,
    counterpart,
  });

  const invalidCapture =
    captured.status === "invalid" ? (
      <InlineAlert tone="warning" title="This browser's saved record was ignored">
        {captured.reason} The receipt below is read from the chain alone.
      </InlineAlert>
    ) : null;

  if (markets.status === "error") {
    return (
      <ReadFailedRecord
        hash={hash}
        title="Market list unavailable"
        error={classifyError(markets.error)}
        fetching={markets.isFetching}
        onRetry={() => void markets.refetch()}
      />
    );
  }

  switch (lookup.state) {
    case "loading":
      return <ReceiptSkeleton hash={hash} />;
    case "pending":
      return <PendingRecord hash={hash} checkedAt={lookup.checkedAt} fetching={fetching} onCheck={checkAgain} />;
    case "not-found":
      return <NotFoundRecord hash={hash} checkedAt={lookup.checkedAt} fetching={fetching} onCheck={checkAgain} />;
    case "error":
      return <ReadFailedRecord hash={hash} title="The receipt could not be read" error={lookup.error} fetching={fetching} onRetry={checkAgain} />;
    case "ready":
      return (
        <div className="flex flex-col gap-4">
          {invalidCapture}
          <ReceiptRecord
            order={lookup.order}
            markets={markets.data ?? []}
            book={book}
            expected={expected}
            counterpart={counterpart}
            captured={capturedEvent}
          />
        </div>
      );
  }
}
