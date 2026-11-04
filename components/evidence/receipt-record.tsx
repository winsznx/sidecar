"use client";

import { CircleCheck, CircleDashed, CircleMinus, ExternalLink, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { NetworkLabel, TokenLabel } from "@/components/icons/token-label";
import { AccountBadge } from "@/components/ui/account-badge";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { InlineAlert } from "@/components/ui/inline-alert";
import { InspectionCard } from "@/components/ui/inspection-card";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SideTag } from "@/components/ui/side-tag";
import { Stamp } from "@/components/ui/stamp";
import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";
import { HIDEKI_CHAIN_ID, type MarketMeta, type VerifiedOrder } from "@/lib/dreamdex/types";
import { receiptHeadline, type ProofEvent } from "@/lib/evidence/proof-event";
import { formatBlockNumber, formatStt, shortAddress } from "@/lib/format/units";
import type { AccountBook } from "@/lib/wallets/identity";

import { CopyValue } from "./copy-value";
import { ExportJsonButton } from "./export-json-button";
import { ReceiptAccounts } from "./receipt-accounts";
import { buildReceiptExport } from "./receipt-export";
import { gasText, outcomeWords, priceText, quantityText, timeInForceWords } from "./receipt-format";
import {
  alertFailures,
  checkDetailText,
  explainRevert,
  formatIsoUtc,
  formatUnixUtc,
  receiptSource,
  receiptTitle,
  receiptVerdict,
  savedAccountFor,
  type CheckRow,
  type ExpectedAccountOrigin,
  type ReceiptVerdict,
} from "./receipt-model";
import { HashLine } from "./receipt-states";
import { RecordFrame, RecordSection } from "./record-frame";

export interface ReceiptRecordProps {
  order: VerifiedOrder;
  markets: readonly MarketMeta[];
  book: AccountBook;
  expected: { account: VerifiedOrder["from"]; origin: ExpectedAccountOrigin } | null;
  counterpart: VerifiedOrder["from"] | null;
  captured: ProofEvent | null;
}

const ORIGIN_WORDS: Record<ExpectedAccountOrigin, string> = {
  captured: "the record this browser saved when it sent the order",
  link: "the account named in this link",
};

function SenderValue({ address, book }: { address: VerifiedOrder["from"]; book: AccountBook }): ReactNode {
  const saved = savedAccountFor(address, book);
  if (saved !== null) return <AccountBadge account={saved.role} label={saved.label} address={address} size="sm" />;
  return <AddressValue address={address} label="sender address" />;
}

/** A short address that keeps the full one a copy away, so long hex never squeezes its label. */
function AddressValue({ address, label }: { address: string; label: string }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="type-data" title={address}>
        {shortAddress(address)}
      </span>
      <CopyValue value={address} label={label} />
    </span>
  );
}

/** Base-unit amounts carry the market's logo; an unlisted target has no symbol to draw one from. */
function MarketAmount({ market, children }: { market: MarketMeta | null; children: ReactNode }): ReactNode {
  if (market === null) return children;
  return <TokenLabel symbol={market.baseSymbol}>{children}</TokenLabel>;
}

function transactionItems(props: ReceiptRecordProps): KeyValueItem[] {
  const { order, book, expected } = props;
  const source = receiptSource(order);
  const minedAt = formatUnixUtc(order.blockTimestamp);
  const market = order.market;
  return [
    {
      id: "network",
      label: "Network",
      value: order.chainId === HIDEKI_CHAIN_ID ? <NetworkLabel>Somnia Hideki {order.chainId}</NetworkLabel> : `Chain ${order.chainId}`,
      source,
    },
    {
      id: "block",
      label: "Block",
      value: formatBlockNumber(order.block),
      hint: minedAt === null ? "Block time unavailable" : `Mined ${minedAt}`,
      source,
    },
    {
      id: "sender",
      label: "Sender",
      value: <SenderValue address={order.from} book={book} />,
      hint: [
        savedAccountFor(order.from, book) === null ? "Not one of the accounts saved in this browser." : null,
        expected === null ? "No selected account to compare with." : `Expected ${shortAddress(expected.account)}, from ${ORIGIN_WORDS[expected.origin]}.`,
      ]
        .filter((line): line is string => line !== null)
        .join(" "),
      source,
    },
    {
      id: "market",
      label: "Target market",
      value: market ? (
        <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
          <TokenLabel symbol={market.baseSymbol}>{market.displaySymbol}</TokenLabel>
          <AddressValue address={market.pool} label="pool address" />
        </span>
      ) : (
        <Unavailable variant="inline" label="Not a listed market" reason={`${order.to ?? "No target"} is not in the market list.`} />
      ),
      source,
    },
    {
      id: "bank",
      label: "MarginBank",
      value: market ? <AddressValue address={market.marginBank} label="MarginBank address" /> : <Unavailable variant="inline" reason="Unknown without a listed market." />,
      hint: "From the market list. The pool’s own answer is checked below.",
    },
    { id: "gas", label: "Gas used", value: gasText(order.gasUsed), source },
    {
      id: "fee",
      label: "Fee paid",
      value:
        order.feePaid === null || order.feePaid === undefined ? (
          <Unavailable variant="inline" reason="The receipt did not report an effective gas price." />
        ) : (
          <TokenLabel symbol="STT">{formatStt(order.feePaid, { withSymbol: true, maxFractionDigits: 6 })}</TokenLabel>
        ),
      source,
    },
  ];
}

function orderItems(order: VerifiedOrder): KeyValueItem[] {
  const source = receiptSource(order);
  const market = order.market;
  const requested = order.requested;
  const placement = order.placement ?? null;
  const notPlacement = "The calldata is not a perp placeOrder call, so the requested order is unknown.";
  const items: KeyValueItem[] = [
    {
      id: "requested",
      label: "Requested",
      value: requested ? (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-2">
            <SideTag side={requested.side} size="sm" />
            <MarketAmount market={market}>{quantityText(requested.quantity, market)}</MarketAmount>
          </span>
          <span>at {priceText(requested.price, market)}</span>
        </span>
      ) : (
        <Unavailable variant="inline" label="Not decoded" reason={notPlacement} />
      ),
      source,
    },
    {
      id: "tif",
      label: "Time in force",
      value: requested ? timeInForceWords(requested.timeInForce) : <Unavailable variant="inline" label="Not decoded" reason={notPlacement} />,
      source,
    },
    {
      id: "order-id",
      label: "Order id",
      value: placement ? (
        <span className="type-data">{placement.orderId.toString()}</span>
      ) : (
        <Unavailable variant="inline" label="None" reason={order.receiptStatus === "reverted" ? "A reverted transaction places no order." : "The receipt has no OrderPlaced event."} />
      ),
      hint: placement ? (placement.rested ? "Rested on the book" : placement.cancelled ? "Remainder cancelled in the same transaction" : "Did not rest on the book") : undefined,
      source,
    },
    {
      id: "filled",
      label: "Filled quantity",
      value: <MarketAmount market={market}>{quantityText(order.filledQuantity, market)}</MarketAmount>,
      hint: "Sum of decoded fills, never the explorer's figure",
      source,
    },
    {
      id: "outcome",
      label: "Outcome",
      value: (
        <StatusPill size="sm" tone={outcomeTone(order.outcome)}>
          {outcomeWords(order.outcome)}
        </StatusPill>
      ),
      source,
    },
  ];
  if (order.receiptStatus === "reverted") {
    items.push({
      id: "revert",
      label: "Revert reason",
      value: revertValue(order),
      hint: revertHint(order),
      source,
    });
  }
  return items;
}

function revertValue(order: VerifiedOrder): ReactNode {
  const explained = explainRevert(order);
  if (explained !== null) return explained.title;
  return order.revertReason ?? <Unavailable variant="inline" label="Not decoded" reason="The replay could not recover a reason." />;
}

function revertHint(order: VerifiedOrder): ReactNode {
  const explained = explainRevert(order);
  const recovered =
    order.revertSource === "parent-block-replay"
      ? "Recovered by replaying the call at the parent block."
      : order.revertSource === "receipt-block-replay"
        ? "Recovered by replaying the call at the receipt's block."
        : null;
  if (explained === null) return recovered ?? undefined;
  return (
    <>
      {explained.message} {explained.nextStep}
      <span className="block">
        Contract error <span className="type-data">{explained.name}</span>
        {recovered !== null ? `. ${recovered}` : "."}
      </span>
    </>
  );
}

function outcomeTone(outcome: VerifiedOrder["outcome"]): "positive" | "warning" | "danger" | "neutral" {
  if (outcome === "FILLED" || outcome === "PARTIALLY_FILLED") return "positive";
  if (outcome === "RESTING" || outcome === "NO_FILL") return "warning";
  if (outcome === "REVERTED") return "danger";
  return "neutral";
}

function FillsList({ order }: { order: VerifiedOrder }): ReactNode {
  if (order.fills.length === 0) {
    return (
      <p className="text-small text-ink-2">
        {order.receiptStatus === "reverted" ? "No fills: the transaction reverted." : "No fills were decoded from this receipt."}
      </p>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-line border-y border-line">
      {order.fills.map((fill, index) => (
        <li key={`${fill.makerOrderId}-${index}`} className="grid gap-x-4 gap-y-0.5 py-2 text-small sm:grid-cols-[auto_1fr_auto]">
          <span className="type-data text-ink-3">Fill {index + 1}</span>
          <span className="font-medium text-ink tabular">
            <MarketAmount market={order.market}>
              {quantityText(fill.quantity, order.market)} at {priceText(fill.price, order.market)}
            </MarketAmount>
          </span>
          <span className="type-data text-caption text-ink-3 sm:text-right">
            maker {fill.makerOrderId.toString()} <span aria-hidden="true">/</span> taker {fill.takerOrderId.toString()}
          </span>
        </li>
      ))}
    </ol>
  );
}

const TONE_HINT: Record<CheckRow["tone"], string> = {
  pass: "",
  fail: "",
  "not-applicable": "text-ink-3",
  "not-checked": "text-ink-3",
  unresolved: "text-warning",
};

/** The two tones CheckMark has no word for, so UNKNOWN only ever means the chain could not decide. */
const QUIET_MARK: Partial<Record<CheckRow["tone"], { icon: LucideIcon; word: string }>> = {
  "not-applicable": { icon: CircleMinus, word: "N/A" },
  "not-checked": { icon: CircleDashed, word: "Not compared" },
};

function QuietMark({ icon: Icon, word }: { icon: LucideIcon; word: string }): ReactNode {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 type-eyebrow text-ink-3">
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      {word}
    </span>
  );
}

function checkItems(rows: readonly CheckRow[], order: VerifiedOrder): KeyValueItem[] {
  return rows.map((row) => {
    const quiet = QUIET_MARK[row.tone];
    // A row with no verdict keeps its mark under the label, out of the verdict column, which
    // also leaves the label its full width on a phone.
    return {
      id: row.check.id,
      label: row.check.label,
      hint: (
        <span className="block wrap-anywhere">
          {quiet !== undefined ? (
            <span className="my-1 flex">
              <QuietMark {...quiet} />
            </span>
          ) : null}
          {checkDetailText(row.check, order)}
          {row.note !== null ? <span className={`block ${TONE_HINT[row.tone]}`}>{row.note}</span> : null}
        </span>
      ),
      value: "",
      check: quiet !== undefined ? undefined : row.check.status,
    };
  });
}

/** Rows without a verdict mark are left out of the card's tally, so the footer names them instead. */
function checksFootnote(rows: readonly CheckRow[], readAt: string): string {
  const notApplicable = rows.filter((row) => row.tone === "not-applicable").length;
  const notCompared = rows.filter((row) => row.tone === "not-checked").length;
  const parts: string[] = [];
  if (notCompared > 0) parts.push(`${notCompared} not compared`);
  if (notApplicable > 0) parts.push(`${notApplicable} not applicable`);
  parts.push(`read ${formatIsoUtc(readAt)}`);
  return parts.join(" · ");
}

/**
 * VERIFIED only for a full pass, marked with the block it was verified against. A receipt-only
 * pass gets a flat tag that names what was not compared. The pass count lives in the card's
 * tally, so the mark does not repeat it.
 */
export function VerdictStamp({ verdict, block }: { verdict: ReceiptVerdict; block: bigint }): ReactNode {
  const blockText = `#${formatBlockNumber(block)}`;
  if (verdict.stamp === "verified") {
    return (
      <span className="inline-flex items-stretch overflow-hidden rounded-md border-2 border-positive bg-raised">
        <span className="inline-flex items-center gap-1.5 bg-positive-soft px-3 type-eyebrow text-positive">
          <CircleCheck aria-hidden="true" className="size-4" strokeWidth={2.25} />
          Verified
        </span>
        <span className="flex flex-col justify-center gap-0.5 px-3 py-1.5">
          <span className="type-eyebrow text-ink-3">At block</span>
          <span className="type-display text-title leading-none text-ink tabular">{blockText}</span>
        </span>
      </span>
    );
  }
  if (verdict.stamp !== "receipt-only") return <Stamp status={verdict.stamp} detail={`Block ${blockText}`} />;
  return (
    <span className="inline-flex flex-col items-start gap-0.5 rounded-xs border border-dashed border-ink-3 px-2.5 py-1.5 text-ink-2">
      <span className="inline-flex items-center gap-1.5 type-eyebrow">
        <CircleDashed aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
        Receipt checks pass
      </span>
      <span className="text-caption text-ink-2">
        {verdict.qualifier} <span aria-hidden="true">·</span> block {blockText}
      </span>
    </span>
  );
}

export function ReceiptRecord(props: ReceiptRecordProps): ReactNode {
  const { order, markets, captured, expected, counterpart } = props;
  const headline = receiptHeadline(order);
  const verdict = receiptVerdict(order, headline, {
    expectedAccount: expected?.account ?? null,
    counterpart,
    capturedIntent: captured !== null ? { hash: captured.orderIntentHash, account: captured.selectedAccount } : null,
  });
  const source = receiptSource(order);
  const market = order.market;
  const requested = order.requested;
  const explained = explainRevert(order);
  const failedChecks = alertFailures(verdict, order);

  const exportJson = (): string =>
    buildReceiptExport({ order, headline, verdict, expected, counterpart, captured, exportedAt: new Date().toISOString() });

  return (
    <RecordFrame
      eyebrow="Order receipt"
      labelledBy="receipt-title"
      badge={<ProvenanceBadge source={source} />}
      title={
        market ? (
          <TokenLabel symbol={market.baseSymbol} size={28}>
            {receiptTitle(order, headline)}
          </TokenLabel>
        ) : (
          receiptTitle(order, headline)
        )
      }
      lead={
        <p>
          {explained !== null ? `${explained.message} ${explained.nextStep}` : headline.detail}
          {market && requested ? (
            <span className="block text-body text-ink-3">
              {requested.side === "long" ? "Long" : "Short"} {quantityText(requested.quantity, market)} at {priceText(requested.price, market)}
            </span>
          ) : null}
        </p>
      }
      meta={
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink-2">
            <span>Sent by</span>
            <SenderValue address={order.from} book={props.book} />
            {savedAccountFor(order.from, props.book) !== null ? (
              <span className="type-data text-small text-ink-3">{shortAddress(order.from)}</span>
            ) : null}
          </p>
          <HashLine hash={order.hash} />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
            <a
              href={order.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xs font-medium text-ink underline decoration-line-strong underline-offset-4 focus-ring hover:decoration-ink pointer-coarse:min-h-10"
            >
              Open on the explorer
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <span className="text-caption text-ink-3">The explorer may show size 0 for perp orders. Sizes here are decoded from the chain receipt.</span>
          </p>
        </>
      }
      footer={
        <>
          <div className="flex min-w-0 max-w-measure flex-1 flex-col gap-2">
            <p className="type-eyebrow text-ink-3">
              Receipt block {formatBlockNumber(order.block)} <span aria-hidden="true">·</span> read {formatIsoUtc(order.readAt)}
            </p>
            <p className="text-small text-ink-2">{verdict.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
            <ExportJsonButton build={exportJson} fileName={`sidecar-receipt-${order.hash.slice(0, 10)}.json`} />
          </div>
        </>
      }
    >
      {failedChecks.length > 0 ? (
        <InlineAlert tone="danger" title={failedChecks.length === 1 ? "A check failed" : "Some checks failed"}>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {failedChecks.map((row) => (
              <li key={row.check.id} className="wrap-anywhere">
                {row.check.label}. {row.check.detail}
              </li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}
      {order.calldata === null ? (
        <InlineAlert tone="warning" title="This is not a perp order placement">
          The transaction’s calldata does not decode as the pool’s placeOrder call, so Sidecar cannot say what was requested.
        </InlineAlert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <RecordSection id="receipt-transaction" title="Transaction">
          <KeyValueList leaders badges={false} items={transactionItems(props)} />
        </RecordSection>
        <RecordSection id="receipt-order" title="Order" aside={<span className="text-caption text-ink-3">Decoded from the signed calldata and the receipt</span>}>
          <KeyValueList leaders badges={false} items={orderItems(order)} />
        </RecordSection>
      </div>

      <RecordSection id="receipt-fills" title="Fills" aside={<span className="text-caption text-ink-3">Decoded from the chain receipt, not from the indexer or the explorer</span>}>
        <FillsList order={order} />
      </RecordSection>

      <section aria-label="Truth checks" className="min-w-0">
        <InspectionCard
          title="Truth checks"
          headingAs="h2"
          items={checkItems(verdict.rows, order)}
          footnote={checksFootnote(verdict.rows, order.readAt)}
          verdict={<VerdictStamp verdict={verdict} block={order.block} />}
        />
      </section>

      <RecordSection id="receipt-accounts" title="Account before and after">
        <ReceiptAccounts order={order} markets={markets} captured={captured} />
      </RecordSection>
    </RecordFrame>
  );
}
