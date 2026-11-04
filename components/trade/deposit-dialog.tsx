"use client";

import { ExternalLink } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import type { Address, Hash, WalletClient } from "viem";

import { TokenLabel } from "@/components/icons/token-label";
import { Button } from "@/components/ui/button";
import { KeyValueList } from "@/components/ui/key-value-list";
import { DialogClose, DialogContent } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { NumberField } from "@/components/ui/number-field";
import { Stamp } from "@/components/ui/stamp";
import type { MarginDepositController } from "@/hooks/use-margin-deposit";
import { explorerTxUrl } from "@/lib/dreamdex/config";
import type { MarketMeta, ReceiptWait } from "@/lib/dreamdex/types";
import { formatUsdso, parseHumanAmount, shortAddress, toInputString } from "@/lib/format/units";

function HashLine({ label, hash, wait }: { label: string; hash: Hash; wait?: ReceiptWait | null }): ReactNode {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-line px-3 py-2">
      <p className="flex items-center justify-between gap-2 text-small font-medium text-ink">
        {label}
        {wait ? <span className="text-caption text-ink-2">{wait.status === "success" ? "Confirmed" : wait.status === "reverted" ? "Reverted" : "Not confirmed"}</span> : null}
      </p>
      <p className="type-data text-caption break-all text-ink-2">{hash}</p>
      <a href={explorerTxUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-caption text-ink-2 underline underline-offset-2 focus-ring">
        <ExternalLink aria-hidden="true" className="size-3" />
        View on explorer<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}

const PHASE_LINE: Partial<Record<MarginDepositController["phase"], string>> = {
  building: "Reading this wallet's balance and allowance.",
  "awaiting-wallet": "Confirm the request in your wallet.",
  "approval-pending": "Approval sent. Once it confirms, your wallet asks you to confirm the deposit.",
  "deposit-pending": "Deposit sent. Waiting for the chain.",
  reconciling: "Checking the deposit receipt.",
};

export function DepositDialog({
  account,
  market,
  walletBalance,
  suggested,
  walletClient,
  deposit,
  returnFocusTo,
}: {
  account: Address;
  market: MarketMeta;
  walletBalance: bigint | null;
  suggested: bigint | null;
  walletClient: WalletClient | null;
  deposit: MarginDepositController;
  /** The control that opened the dialog, when it is still on the page. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}): ReactNode {
  const symbol = market.quoteSymbol;
  const decimals = market.quoteDecimals;
  const initial = suggested !== null && (walletBalance === null || suggested <= walletBalance) ? suggested : walletBalance;
  const [amountText, setAmountText] = useState(initial === null || initial <= 0n ? "" : toInputString(initial, decimals));
  const parsed = parseHumanAmount(amountText, decimals);
  const amountError =
    amountText.trim() === ""
      ? undefined
      : !parsed.ok
        ? parsed.error.message
        : parsed.value <= 0n
          ? "Enter an amount greater than zero."
          : walletBalance !== null && parsed.value > walletBalance
            ? `This wallet holds ${formatUsdso(walletBalance, decimals, { withSymbol: true, symbol })}.`
            : undefined;
  const amount = parsed.ok && amountError === undefined && parsed.value > 0n ? parsed.value : null;
  const { phase, built, verified, problem } = deposit;
  const editable = phase === "idle" || phase === "built" || phase === "failed" || phase === "rejected" || phase === "approval-not-confirmed";
  const usd = (raw: bigint): string => formatUsdso(raw, decimals, { withSymbol: true, symbol, maxFractionDigits: decimals });

  return (
    <DialogContent
      title={`Fund ${shortAddress(account)}'s margin`}
      description={`Moves ${symbol} from this wallet into this same wallet's own margin account. It cannot fund any other account.`}
      data-testid="deposit-dialog"
      onCloseAutoFocus={(event) => {
        const target = returnFocusTo?.current ?? null;
        if (target === null || !target.isConnected) return;
        event.preventDefault();
        target.focus();
      }}
      actions={
        <>
          <DialogClose asChild>
            <Button variant="ghost">{phase === "done" ? "Done" : deposit.unresolved ? "Hide" : "Close"}</Button>
          </DialogClose>
          {phase === "unknown" && deposit.depositHash === null ? (
            <Button variant="secondary" onClick={deposit.acknowledgeUnknown}>
              I checked my wallet: nothing is pending
            </Button>
          ) : null}
          {phase === "unknown" && deposit.depositHash !== null ? (
            <Button variant="secondary" loading={deposit.busy} onClick={() => void deposit.checkAgain()}>
              Check again
            </Button>
          ) : null}
          {phase === "built" ? (
            <Button
              disabledReason={walletClient === null ? "Your wallet is not ready to sign on Hideki." : undefined}
              onClick={() => {
                if (walletClient !== null) void deposit.send(walletClient);
              }}
            >
              {built?.approval ? "Approve, then deposit" : "Deposit"}
            </Button>
          ) : editable ? (
            <Button
              variant="secondary"
              loading={deposit.busy}
              loadingLabel="Preparing"
              disabledReason={
                walletClient === null ? "Your wallet is not ready to sign on Hideki." : amount === null ? "Enter a valid amount first." : undefined
              }
              onClick={() => {
                if (walletClient !== null && amount !== null) void deposit.prepare({ account, amount, market, walletClient });
              }}
            >
              Prepare deposit
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <NumberField
          label={`Amount of ${symbol}`}
          value={amountText}
          onValueChange={(text) => {
            setAmountText(text);
            if (phase === "built") deposit.reset();
          }}
          disabled={!editable}
          size="lg"
          suffix={<TokenLabel symbol={symbol} />}
          error={amountError}
          hint={walletBalance === null ? "The wallet balance could not be read." : `In this wallet: ${usd(walletBalance)}`}
        />
        {built !== null ? (
          <section aria-label="Steps your wallet will ask you to sign" className="flex flex-col gap-2">
            <h3 className="text-small font-semibold text-ink-2">What your wallet will ask you to sign</h3>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-small text-ink">
              {built.approval !== null ? (
                <li>
                  Approve the margin bank <span className="type-data">{shortAddress(built.marginBank)}</span> to take exactly {usd(built.amount)}. Not
                  unlimited.
                </li>
              ) : (
                <li>No approval needed: the existing allowance of {usd(built.allowance)} covers it.</li>
              )}
              <li>Deposit {usd(built.amount)} into your own margin account.</li>
            </ol>
            <p className="text-caption text-ink-3">Checked against this wallet at block {built.block.toString()}.</p>
          </section>
        ) : null}
        {deposit.unresolved ? (
          <p className="text-caption text-ink-3">Closing this keeps following the deposit. Sidecar won&apos;t prepare another until it is resolved.</p>
        ) : null}
        {PHASE_LINE[phase] !== undefined ? (
          <p role="status" className="text-small text-ink-2">
            {PHASE_LINE[phase]}
          </p>
        ) : null}
        {deposit.approvalHash !== null ? <HashLine label="Approval" hash={deposit.approvalHash} wait={deposit.approvalWait} /> : null}
        {deposit.depositHash !== null ? <HashLine label="Deposit" hash={deposit.depositHash} /> : null}
        {problem !== null ? (
          <InlineAlert tone={phase === "rejected" ? "warning" : "danger"} title={problem.title} announce="assertive">
            {problem.message} {problem.nextStep}
          </InlineAlert>
        ) : null}
        {verified !== null ? (
          <section aria-label="Verified deposit" className="flex flex-col gap-3" role="status">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-semibold text-ink">
                {verified.outcome === "CREDITED"
                  ? `Credited ${verified.creditedAmount === null ? "" : usd(verified.creditedAmount)} to ${shortAddress(verified.from)}'s margin account.`
                  : verified.outcome === "REVERTED"
                    ? "The deposit reverted. Nothing was credited."
                    : "The deposit confirmed, but Sidecar could not verify the credit."}
              </p>
              <Stamp status={verified.outcome === "CREDITED" ? "verified" : "not-verified"} />
            </div>
            <KeyValueList
              density="compact"
              items={verified.checks.map((check) => ({ id: check.id, label: check.label, value: <span className="text-caption text-ink-2">{check.detail}</span>, check: check.status }))}
            />
          </section>
        ) : null}
      </div>
    </DialogContent>
  );
}
