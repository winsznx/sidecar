"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { CopyValue } from "@/components/evidence/copy-value";
import { ConnectWalletButton } from "@/components/trade/wallet-control";
import { FAUCET_ALLOWANCE, FAUCET_COMMAND } from "@/components/trade/trade-copy";
import { Band } from "@/components/ui/band";
import { Button, buttonClassName } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { Unavailable } from "@/components/ui/unavailable";
import { useStartChecklist } from "@/hooks/use-start-checklist";
import type { WalletState } from "@/hooks/use-wallet-state";
import { NETWORK_NAME } from "@/lib/dreamdex/chain-age";
import { NETWORK, PERP_ORDER_GAS_LIMIT } from "@/lib/dreamdex/config";
import { HIDEKI_CHAIN_ID, type MarketMeta } from "@/lib/dreamdex/types";
import { formatBlockNumber, formatStt, formatUsdso, UNAVAILABLE_TEXT } from "@/lib/format/units";

import type { CollateralCheck, GasCheck, MarginCheck, ReadFigure, StartChecks, StepStatus } from "./start-steps";
import { CONNECT_TO_CHECK, StepStatusMark } from "./step-status";

const FAUCET_PLACEHOLDER = "0xYourAddress";

function Step({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  children: ReactNode;
}): ReactNode {
  const id = `start-step-${index}`;
  return (
    <li
      aria-labelledby={id}
      data-testid={id}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-4 border-t border-dashed border-line-strong py-8 md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,18rem)] md:gap-x-8 md:py-10"
    >
      <p aria-hidden="true" className="col-start-1 row-start-1 type-display text-display leading-none text-ink-3 md:row-span-2">
        {String(index).padStart(2, "0")}
      </p>
      <h2 id={id} className="col-span-2 row-start-2 text-title font-semibold tracking-tight text-ink md:col-span-1 md:col-start-2 md:row-start-1 md:self-center">
        <span className="sr-only">Step {index}: </span>
        {title}
      </h2>
      <div className="col-start-2 row-start-1 self-center justify-self-end text-right md:col-start-3">
        <StepStatusMark status={status} />
      </div>
      <div className="col-span-2 flex min-w-0 max-w-measure flex-col gap-4 text-body text-ink-2 md:col-start-2 md:row-start-2">{children}</div>
    </li>
  );
}

function figureValue(figure: ReadFigure | null, format: (value: bigint) => string, status: StepStatus): ReactNode {
  if (figure !== null) return format(figure.value);
  if (status.kind === "connect") return <span className="text-ink-3">{CONNECT_TO_CHECK}</span>;
  if (status.kind === "unavailable") return <Unavailable variant="inline" reason={status.reason} />;
  return <span className="text-ink-3">Reading</span>;
}

function figureItem(id: string, label: string, figure: ReadFigure | null, format: (value: bigint) => string, status: StepStatus, hint?: string): KeyValueItem {
  return { id, label, hint, value: figureValue(figure, format, status), source: figure?.source ?? undefined };
}

function ConnectStep({ wallet, status }: { wallet: WalletState; status: StepStatus }): ReactNode {
  return (
    <Step index={1} title="Connect a wallet" status={status}>
      <p>Sidecar reads balances and margin for the exact address your wallet signs with. It never sees your keys.</p>
      <InlineAlert tone="warning" title="Use a fresh testnet account (EOA)">
        Never connect a smart wallet or a dreamDEX app account. Create a new plain account in your wallet for Hideki.
      </InlineAlert>
      {wallet.address === null ? (
        <div>
          <ConnectWalletButton wallet={wallet} size="md" variant="primary" />
        </div>
      ) : (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ink-3">{wallet.connectorName ?? "Wallet"}:</span>
          <span className="min-w-0 break-all type-data text-small text-ink">{wallet.address}</span>
          <CopyValue value={wallet.address} label="wallet address" />
        </p>
      )}
    </Step>
  );
}

function NetworkStep({ wallet, status }: { wallet: WalletState; status: StepStatus }): ReactNode {
  const params: KeyValueItem[] = [
    { id: "name", label: "Network", value: NETWORK_NAME },
    { id: "chain", label: "Chain id", value: <span className="type-data">{HIDEKI_CHAIN_ID}</span> },
    {
      id: "rpc",
      label: "RPC",
      value: (
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="min-w-0 break-all type-data text-caption">{NETWORK.rpcUrl}</span>
          <CopyValue value={NETWORK.rpcUrl} label="RPC URL" />
        </span>
      ),
    },
    { id: "currency", label: "Gas token", value: "STT" },
  ];
  const wrongChain = wallet.address !== null && !wallet.onHideki;
  return (
    <Step index={2} title="Put the wallet on Hideki" status={status}>
      <p>
        Sidecar only reads and signs on {NETWORK_NAME}. Switching asks your wallet to add the network if it doesn&apos;t know it yet. If it
        can&apos;t, add it by hand with these values.
      </p>
      <KeyValueList density="compact" items={params} />
      {wrongChain ? (
        <div className="flex flex-col items-start gap-2">
          <Button variant="primary" loading={wallet.switching} loadingLabel="Switching" onClick={wallet.switchToHideki}>
            Switch to Hideki
          </Button>
          {wallet.switchError !== null ? (
            <p role="alert" className="text-small text-danger">
              {wallet.switchError}
            </p>
          ) : null}
        </div>
      ) : null}
    </Step>
  );
}

function FaucetStep({ address }: { address: string | null }): ReactNode {
  const command = `${FAUCET_COMMAND} ${address ?? FAUCET_PLACEHOLDER}`;
  return (
    <Step index={3} title="Claim faucet funds" status={{ kind: "manual", label: "Done in Telegram" }}>
      <p>
        Send this message to the faucet bot in the dreamDEX builder group on Telegram. It pays {FAUCET_ALLOWANCE}. Sidecar can&apos;t see
        Telegram, so steps 4 and 5 read whether the funds arrived.
      </p>
      <p className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-raised px-3 py-2 shadow-raised">
        <code className="min-w-0 flex-1 break-all type-data text-small text-ink" data-testid="faucet-command">
          {command}
        </code>
        {address !== null ? <CopyValue value={command} label="faucet command" /> : null}
      </p>
      {address === null ? <p className="text-small text-ink-3">Connect a wallet and its address fills in here.</p> : null}
    </Step>
  );
}

function GasStep({ gas }: { gas: GasCheck }): ReactNode {
  const stt = (value: bigint): string => formatStt(value, { withSymbol: true });
  const items: KeyValueItem[] = [
    figureItem("balance", "STT in this wallet", gas.balance, stt, gas.status),
    {
      id: "required",
      label: "Needed up front",
      value: stt(gas.required),
      hint: `${formatBlockNumber(PERP_ORDER_GAS_LIMIT)} gas at the SDK's max fee per gas. Far less is spent.`,
    },
  ];
  if (gas.shortfall !== null) items.push({ id: "short", label: "Short by", value: <span className="text-warning">{stt(gas.shortfall)}</span> });
  return (
    <Step index={4} title="Hold enough STT for gas" status={gas.status}>
      <p>The node only admits a transaction when the sender holds the full gas allowance up front, so the wallet needs at least this much STT before its first order or deposit.</p>
      <KeyValueList items={items} />
    </Step>
  );
}

function CollateralStep({ collateral, market }: { collateral: CollateralCheck; market: MarketMeta | null }): ReactNode {
  const symbol = market?.quoteSymbol ?? "USDso";
  const usdso = (value: bigint): string => (market === null ? UNAVAILABLE_TEXT : formatUsdso(value, market.quoteDecimals, { withSymbol: true, symbol }));
  return (
    <Step index={5} title={`Hold ${symbol} in the wallet`} status={collateral.status}>
      <p>{symbol} is the collateral every market settles in. The faucet sends it to the wallet, outside the MarginBank.</p>
      <KeyValueList items={[figureItem("balance", `${symbol} in this wallet`, collateral.balance, usdso, collateral.status, "Re-read every 10 s.")]} />
    </Step>
  );
}

function MarginStep({ margin, market }: { margin: MarginCheck; market: MarketMeta | null }): ReactNode {
  const symbol = market?.quoteSymbol ?? "USDso";
  const usdso = (value: bigint): string => (market === null ? UNAVAILABLE_TEXT : formatUsdso(value, market.quoteDecimals, { withSymbol: true, symbol }));
  return (
    <Step index={6} title="Deposit margin in the MarginBank" status={margin.status}>
      <p>
        Orders lock margin from this account in the MarginBank, not from the wallet. Deposits happen on the trade screen: add this wallet as an
        account, and when an order needs collateral it offers Fund this account&apos;s margin.
      </p>
      <KeyValueList
        items={[
          figureItem("unlocked", "Unlocked collateral (before PnL)", margin.unlocked, usdso, margin.status),
          figureItem("locked", "Locked", margin.locked, usdso, margin.status),
        ]}
      />
      <div>
        <Link href="/trade" className={buttonClassName({ variant: "secondary" })}>
          Fund this account&apos;s margin
        </Link>
      </div>
    </Step>
  );
}

function SecondWalletStep(): ReactNode {
  return (
    <Step index={7} title="Optional: a second wallet for account B" status={{ kind: "manual", label: "Optional" }}>
      <p>
        Sidecar compares a trade in your shared margin (account A) against a separate account (B) with its own margin, so the new trade
        doesn&apos;t share collateral with A&apos;s positions. Liquidation is still possible in either account.
      </p>
      <p>
        B is just another fresh wallet. Run steps 1 to 6 with it, then add it as account B on the trade screen. If only A can claim from
        the faucet, send B part of A&apos;s STT and USDso with a normal wallet transfer.
      </p>
      <div>
        <Link href="/trade" className={buttonClassName({ variant: "ghost" })}>
          Add account B on the trade screen
        </Link>
      </div>
    </Step>
  );
}

function tallyLine(checks: StartChecks): string {
  if (checks.tally === null) return `${CONNECT_TO_CHECK}. Nothing below is marked as passed until it is read.`;
  return `${checks.tally.passed} of ${checks.tally.total} readable checks pass. Steps 3 and 7 happen outside Sidecar.`;
}

/** A fresh wallet's path to its first order on Hideki. Every status is a live read; this page never sends. */
export function StartScreen(): ReactNode {
  const { wallet, market, checks } = useStartChecklist();
  return (
    <div className="flex flex-col gap-16 md:gap-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end lg:gap-16">
        <SectionHeading
          as="h1"
          size="display"
          eyebrow="Get started"
          title="Ready a fresh wallet for Hideki"
          lede="Seven steps between a new testnet wallet and its first order. While a wallet is connected, Sidecar reads each one from the chain. This page only reads. It never sends a transaction."
        />
        <p role="status" className="type-eyebrow text-ink-2 lg:pb-2" data-testid="start-tally">
          {tallyLine(checks)}
        </p>
      </div>

      <ol aria-label="Steps" className="flex flex-col border-b border-dashed border-line-strong">
        <ConnectStep wallet={wallet} status={checks.connect} />
        <NetworkStep wallet={wallet} status={checks.network} />
        <FaucetStep address={wallet.address} />
        <GasStep gas={checks.gas} />
        <CollateralStep collateral={checks.collateral} market={market} />
        <MarginStep margin={checks.margin} market={market} />
        <SecondWalletStep />
      </ol>

      <Band
        aria-labelledby="start-ready"
        corners={{
          topStart: <span>Somnia Hideki · {HIDEKI_CHAIN_ID}</span>,
          topEnd: <span>Paper funds only</span>,
          bottomEnd: <span>Read from this browser</span>,
        }}
      >
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            id="start-ready"
            size="section"
            title="Then compare the two accounts"
            lede="The trade screen sizes one order in shared margin and in a separate account, side by side, before anything is signed."
          />
          <Link href="/trade" className={buttonClassName({ variant: "accent", size: "lg" })}>
            Open the trade screen
          </Link>
        </div>
      </Band>
    </div>
  );
}
