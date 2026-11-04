"use client";

import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SkeletonText } from "@/components/ui/skeleton";
import { Unavailable } from "@/components/ui/unavailable";
import type { AccountAtBlock, MarketMeta, Reading, Source, VerifiedOrder } from "@/lib/dreamdex/types";
import type { ProofEvent } from "@/lib/evidence/proof-event";
import { formatBlockNumber, formatStt, shortAddress } from "@/lib/format/units";
import { useAccountAtBlocks, type BlockRead } from "@/hooks/use-receipt-snapshots";

import { readCapturedAccountState, type CapturedAccountState } from "./captured-proof";
import { collateralText, positionText } from "./receipt-format";
import { formatIsoUtc, positionFromReceipt } from "./receipt-model";

const POSITIONS_AT_BLOCK =
  "Positions cannot be read at a past block through the SDK. Its position reads answer at the head only.";

function readingItem<T>(id: string, label: ReactNode, reading: Reading<T>, render: (value: T) => string): KeyValueItem {
  if (!reading.ok) return { id, label, value: <Unavailable variant="inline" reason={reading.reason} /> };
  return { id, label, value: render(reading.value), source: reading.source };
}

function atBlockItems(read: AccountAtBlock, market: MarketMeta, positions: KeyValueItem): KeyValueItem[] {
  return [
    readingItem("equity", "Equity", read.equity, (v) => collateralText(v.equity, market)),
    readingItem("locked", "Locked collateral", read.equity, (v) => collateralText(v.lockedCollateral, market)),
    readingItem("total", "Total equity", read.equity, (v) => collateralText(v.totalEquity, market)),
    readingItem("orders", "Open orders", read.openOrders, (v) => String(v.length)),
    readingItem("wallet", <TokenLabel symbol={market.quoteSymbol}>Wallet {market.quoteSymbol}</TokenLabel>, read.walletCollateral, (v) => collateralText(v.balance, market)),
    readingItem("gas", <TokenLabel symbol="STT">STT for gas</TokenLabel>, read.gasBalance, (v) => formatStt(v, { withSymbol: true })),
    positions,
  ];
}

/** Before the transaction there is no event to read a position from, and the SDK cannot pin one. */
const POSITION_BEFORE: KeyValueItem = {
  id: "positions",
  label: "Position",
  value: <Unavailable variant="inline" label="Not readable" reason={POSITIONS_AT_BLOCK} />,
};

/** The sender's position after the transaction, from the PositionUpdated event in its own receipt. */
function positionAfterItem(order: VerifiedOrder, market: MarketMeta, markets: readonly MarketMeta[]): KeyValueItem {
  const label = <TokenLabel symbol={market.baseSymbol}>Position in {market.displaySymbol}</TokenLabel>;
  const position = positionFromReceipt(order);
  if (position === null) {
    return {
      id: "positions",
      label,
      value: (
        <Unavailable
          variant="inline"
          label="Not in this receipt"
          reason={`The receipt has no position update for the sender. ${POSITIONS_AT_BLOCK}`}
        />
      ),
    };
  }
  const source: Source = { kind: "chain", block: order.block, readAt: order.readAt, via: "PositionUpdated event in this receipt" };
  return {
    id: "positions",
    label,
    hint: "From this receipt's PositionUpdated event",
    value: position.size === 0n ? "Flat (size 0)" : positionText({ pool: market.pool, baseSymbol: market.baseSymbol, size: position.size, entryPrice: position.entryPrice }, markets),
    source,
  };
}

function BlockColumn({ title, block, read, market, positions }: { title: string; block: bigint; read: BlockRead; market: MarketMeta; positions: KeyValueItem }): ReactNode {
  const source: Source | null = read.state === "ok" ? { kind: "chain", block, readAt: read.read.readAt, via: "readAccountAtBlock" } : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-small font-semibold text-ink">
          {title} <span className="type-data font-normal text-ink-3">block {formatBlockNumber(block)}</span>
        </h3>
        {source !== null ? <ProvenanceBadge source={source} size="sm" /> : null}
      </div>
      {read.state === "loading" ? (
        <div aria-busy="true">
          <SkeletonText lines={5} />
          <span className="sr-only">Reading the account at block {formatBlockNumber(block)}.</span>
        </div>
      ) : read.state === "error" ? (
        <Unavailable reason={read.reason} />
      ) : (
        <KeyValueList leaders density="compact" badges={false} items={atBlockItems(read.read, market, positions)} />
      )}
    </div>
  );
}

/** The sender read at the parent block and at the transaction's block, fresh from chain history. */
function ReadAtBlocks({ order, market, markets }: { order: VerifiedOrder; market: MarketMeta; markets: readonly MarketMeta[] }): ReactNode {
  const { before, after } = useAccountAtBlocks({ account: order.from, market, markets, block: order.block, enabled: true });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-2">
        Read now from chain history for the sender {shortAddress(order.from)}, at the block before this transaction and at its own block. The
        position after comes from the receipt itself.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <BlockColumn title="Before" block={order.block - 1n} read={before} market={market} positions={POSITION_BEFORE} />
        <BlockColumn title="After" block={order.block} read={after} market={market} positions={positionAfterItem(order, market, markets)} />
      </div>
    </div>
  );
}

function positionsItem(state: CapturedAccountState, markets: readonly MarketMeta[], source: Source | null): KeyValueItem {
  const complete = state.readStatus === "verified";
  if (state.positions.length === 0) {
    if (complete && source !== null) return { id: "positions", label: "Positions", value: "None", source };
    return {
      id: "positions",
      label: "Positions",
      value: (
        <Unavailable
          variant="inline"
          reason={state.issues.length > 0 ? state.issues.join(" ") : "The position read did not complete when this was captured."}
        />
      ),
    };
  }
  return {
    id: "positions",
    label: "Positions",
    hint: complete ? undefined : "The read was partial, so this list may be missing a position.",
    value: (
      <span className="flex flex-col items-end gap-0.5">
        {state.positions.map((position) => (
          <span key={position.pool}>{positionText(position, markets)}</span>
        ))}
      </span>
    ),
    source: source ?? undefined,
  };
}

/**
 * The column header badges the margin reads as CHAIN. A row read another way shows its own badge
 * under the label, so an SDK value never sits under a CHAIN label unmarked.
 */
function withOwnBadge(item: KeyValueItem): KeyValueItem {
  if (item.source === undefined || item.source.kind === "chain") return item;
  return {
    ...item,
    hint: (
      <span className="mt-1 flex flex-col items-start gap-1">
        {item.hint !== undefined ? <span>{item.hint}</span> : null}
        <ProvenanceBadge source={item.source} size="sm" />
      </span>
    ),
  };
}

function capturedItems(state: CapturedAccountState, market: MarketMeta, markets: readonly MarketMeta[], readAt: string): KeyValueItem[] {
  const via = "captured in this browser";
  const chain: Source = { kind: "chain", block: state.block, readAt, via: `getMarginAccount, ${via}` };
  const positions: Source = { kind: "sdk", block: state.block, readAt, via: `listPerpPositionAnalytics, ${via}` };
  const margin = state.margin;
  const marginReason = "The margin read failed when this was captured.";
  const marginRow = (id: string, label: string, pick: (m: NonNullable<CapturedAccountState["margin"]>) => bigint): KeyValueItem =>
    margin
      ? { id, label, value: collateralText(pick(margin), market), source: chain }
      : { id, label, value: <Unavailable variant="inline" reason={marginReason} /> };
  return [
    marginRow("unlocked", "Unlocked collateral", (m) => m.unlockedCollateral),
    marginRow("locked", "Locked collateral", (m) => m.lockedCollateral),
    marginRow("equity", "Equity", (m) => m.equity),
    marginRow("mm", "Maintenance requirement", (m) => m.mmReq),
    withOwnBadge(positionsItem(state, markets, positions)),
    state.gasBalance === null
      ? { id: "gas", label: <TokenLabel symbol="STT">STT for gas</TokenLabel>, value: <Unavailable variant="inline" reason="The gas balance read failed when this was captured." /> }
      : { id: "gas", label: <TokenLabel symbol="STT">STT for gas</TokenLabel>, value: formatStt(state.gasBalance, { withSymbol: true }), source: { ...chain, via: `eth_getBalance, ${via}` } },
  ];
}

function CapturedColumn({ title, state, market, markets, fallbackReadAt }: { title: string; state: CapturedAccountState; market: MarketMeta; markets: readonly MarketMeta[]; fallbackReadAt: string }): ReactNode {
  const readAt = state.readAt ?? fallbackReadAt;
  const badge: Source = { kind: "chain", block: state.block, readAt, via: "getAccountSnapshot, captured in this browser" };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-small font-semibold text-ink">
          {title} <span className="type-data font-normal text-ink-3">block {formatBlockNumber(state.block)}</span>
        </h3>
        <ProvenanceBadge source={badge} size="sm" />
      </div>
      <KeyValueList leaders density="compact" badges={false} items={capturedItems(state, market, markets, readAt)} />
      {state.issues.length > 0 ? (
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-caption text-ink-3">
          {state.issues.map((issue) => (
            <li key={issue} className="wrap-anywhere">
              {issue}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The before and after the trade screen saved in this browser when it sent the order. A side the
 * record lacks is read fresh from chain history instead of being left blank.
 */
function CapturedInBrowser({ event, order, market, markets }: { event: ProofEvent; order: VerifiedOrder; market: MarketMeta; markets: readonly MarketMeta[] }): ReactNode {
  const before = readCapturedAccountState(event.beforeAccountState);
  const after = readCapturedAccountState(event.afterAccountState);
  const history = useAccountAtBlocks({ account: order.from, market, markets, block: order.block, enabled: before === null || after === null });
  const captured = [before, after].filter((state): state is CapturedAccountState => state !== null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-2">
        Captured in this browser on {formatIsoUtc(event.observedAtUtc)} for the selected account {shortAddress(event.selectedAccount)}
        {captured.length > 0 ? `, at block ${captured.map((state) => formatBlockNumber(state.block)).join(" and ")}` : ""}. These are the reads the
        trade screen made at the time, not a fresh read.
        {before === null || after === null ? " The side the record lacks is read now from chain history." : ""}
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {before !== null ? (
          <CapturedColumn title="Before" state={before} market={market} markets={markets} fallbackReadAt={event.observedAtUtc} />
        ) : (
          <BlockColumn title="Before" block={order.block - 1n} read={history.before} market={market} positions={POSITION_BEFORE} />
        )}
        {after !== null ? (
          <CapturedColumn title="After" state={after} market={market} markets={markets} fallbackReadAt={event.observedAtUtc} />
        ) : (
          <BlockColumn title="After" block={order.block} read={history.after} market={market} positions={positionAfterItem(order, market, markets)} />
        )}
      </div>
    </div>
  );
}

export interface ReceiptAccountsProps {
  order: VerifiedOrder;
  markets: readonly MarketMeta[];
  captured: ProofEvent | null;
}

export function ReceiptAccounts({ order, markets, captured }: ReceiptAccountsProps): ReactNode {
  const market = order.market;
  if (market === null) {
    return <Unavailable reason="The target is not a listed perp market, so Sidecar cannot tell which MarginBank account to read." />;
  }
  if (captured !== null) return <CapturedInBrowser event={captured} order={order} market={market} markets={markets} />;
  return <ReadAtBlocks order={order} market={market} markets={markets} />;
}
