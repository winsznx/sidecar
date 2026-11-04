"use client";

import { LogOut, TriangleAlert, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import type { WalletState } from "@/hooks/use-wallet-state";
import { shortAddress } from "@/lib/format/units";
import { sameAddress, type AccountBook } from "@/lib/wallets/identity";

function connectedRole(book: AccountBook, address: string | null): "A" | "B" | null {
  if (sameAddress(book.primary?.address, address)) return "A";
  if (sameAddress(book.separate?.address, address)) return "B";
  return null;
}

export function WalletControl({ wallet, book }: { wallet: WalletState; book: AccountBook }): ReactNode {

  if (wallet.address !== null) {
    const role = connectedRole(book, wallet.address);
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span
          data-testid="connected-wallet"
          className="inline-flex min-w-0 items-center gap-2 rounded-sm border border-line bg-raised py-1.5 pr-2.5 pl-2"
        >
          <Wallet aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
          <span className="sr-only">Connected wallet{role === null ? "" : `, account ${role}`}:</span>
          {role !== null ? <AccountLetter account={role} size="sm" /> : null}
          <span className="type-data text-caption text-ink-2" title={wallet.address}>
            {shortAddress(wallet.address)}
          </span>
          {!wallet.onHideki ? (
            <>
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
              <span className="sr-only">on the wrong network</span>
            </>
          ) : null}
        </span>
        <IconButton label="Disconnect wallet" icon={<LogOut aria-hidden="true" />} tooltip onClick={wallet.disconnect} />
      </span>
    );
  }

  return <ConnectWalletButton wallet={wallet} />;
}

/**
 * Opens the wallet picker. The button is the dialog's trigger, so focus returns to it on close.
 * Used in the top bar and as account A's primary action while nothing is connected.
 */
export function ConnectWalletButton({
  wallet,
  size = "sm",
  tone = "neutral",
  variant = "secondary",
  block = false,
}: {
  wallet: WalletState;
  size?: "sm" | "md";
  tone?: "neutral" | "a" | "b";
  variant?: "primary" | "secondary";
  block?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={size}
          tone={tone}
          variant={variant}
          block={block}
          leading={<Wallet aria-hidden="true" className="size-3.5" />}
          loading={wallet.connecting || wallet.status === "reconnecting"}
          loadingLabel="Connecting"
        >
          Connect wallet
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Connect a wallet"
        description="Sidecar reads your accounts and asks your wallet to sign. It never sees your keys."
        actions={
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        }
      >
        {wallet.options.length === 0 ? (
          <p className="text-body text-ink-2">
            No browser wallet was found. Install or unlock a wallet extension, then reload this page.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Available wallets">
            {wallet.options.map((option) => (
              <li key={option.uid}>
                <Button
                  variant="secondary"
                  block
                  className="justify-start"
                  leading={
                    option.icon ? (
                      // Wallet icons arrive as data URIs from EIP-6963 announcements, which next/image cannot optimise.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={option.icon} alt="" className="size-5 rounded-xs" />
                    ) : (
                      <Wallet aria-hidden="true" className="size-4" />
                    )
                  }
                  onClick={() => {
                    wallet.connect(option.uid);
                    setOpen(false);
                  }}
                >
                  {option.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {wallet.connectError !== null ? (
          <p role="alert" className="mt-3 text-small text-danger">
            {wallet.connectError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
