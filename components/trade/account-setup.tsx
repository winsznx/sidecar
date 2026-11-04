"use client";

import { ChevronDown, Eye, PenLine, UserPlus, X } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { AccountBadge, AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import type { WalletState } from "@/hooks/use-wallet-state";
import { shortAddress } from "@/lib/format/units";
import {
  createAccountIdentity,
  defaultLabel,
  MAX_LABEL_LENGTH,
  sameAddress,
  withAccount,
  withoutAccount,
  type AccountBook,
  type AccountIdentity,
  type AccountRole,
} from "@/lib/wallets/identity";

import { ConnectWalletButton } from "./wallet-control";

const ROLE_LETTER: Record<AccountRole, "A" | "B"> = { primary: "A", separate: "B" };

const ROLE_COPY: Record<AccountRole, { name: string; empty: string; explain: string }> = {
  primary: {
    name: "the main body",
    empty: "No primary account yet",
    explain: "The wallet that holds your open positions. A new trade here shares their collateral.",
  },
  separate: {
    name: "the sidecar",
    empty: "No second wallet yet",
    explain: "A second wallet with its own margin account. A trade here shares nothing with A.",
  },
};

type AddResult = { ok: true } | { ok: false; message: string };

function addAccount(
  book: AccountBook,
  save: (book: AccountBook) => void,
  input: { address: string; role: AccountRole; label: string; watchOnly: boolean },
): AddResult {
  const created = createAccountIdentity({ ...input, label: input.label.trim() === "" ? undefined : input.label, nowMs: Date.now() });
  if (!created.ok) return { ok: false, message: created.issues.map((issue) => issue.message).join(" ") };
  const placed = withAccount(book, created.identity);
  if (!placed.ok) return { ok: false, message: placed.issues.map((issue) => issue.message).join(" ") };
  save(placed.book);
  return { ok: true };
}

function PasteAddressForm({
  role,
  book,
  save,
}: {
  role: AccountRole;
  book: AccountBook;
  save: (book: AccountBook) => void;
}): ReactNode {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = addAccount(book, save, { address, role, label, watchOnly: true });
    if (result.ok) {
      setAddress("");
      setLabel("");
      setError(null);
    } else {
      setError(result.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label={`Watch an address as account ${ROLE_LETTER[role]}`}>
      <TextField
        label="Address to watch"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        inputClassName="type-data"
        error={error ?? undefined}
        hint="Watch-only: Sidecar reads it but never offers to sign for it."
      />
      <TextField
        label="Label (optional)"
        value={label}
        maxLength={MAX_LABEL_LENGTH}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={defaultLabel(role)}
      />
      <Button type="submit" variant="secondary" size="sm" leading={<Eye aria-hidden="true" className="size-3.5" />}>
        Watch this address
      </Button>
    </form>
  );
}

function LabelEditor({
  identity,
  book,
  save,
  onDone,
}: {
  identity: AccountIdentity;
  book: AccountBook;
  save: (book: AccountBook) => void;
  onDone: () => void;
}): ReactNode {
  const [label, setLabel] = useState(identity.label);
  const [error, setError] = useState<string | null>(null);
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = addAccount(book, save, {
      address: identity.address,
      role: identity.role,
      label,
      watchOnly: identity.watchOnly === true,
    });
    if (result.ok) onDone();
    else setError(result.message);
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <TextField
        label="Label"
        value={label}
        maxLength={MAX_LABEL_LENGTH}
        onChange={(event) => setLabel(event.target.value)}
        error={error ?? undefined}
        className="min-w-40 flex-1"
        autoFocus
      />
      <Button type="submit" size="sm" variant="secondary">
        Save label
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

/** What Sidecar will read from account A, so the card says what adding it changes. */
const PRIMARY_READS = [
  "Open positions and their unrealized PnL",
  "Margin account: equity, locked collateral, maintenance",
  "STT for gas and USDso left in the wallet",
] as const;

function PrimaryReads(): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-ink-3">Once added, Sidecar reads from the chain</p>
      <ul className="flex flex-col gap-1.5">
        {PRIMARY_READS.map((read) => (
          <li key={read} className="flex items-baseline gap-2 text-small text-ink-2">
            <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-account-a" />
            {read}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccountSlot({
  role,
  book,
  save,
  wallet,
}: {
  role: AccountRole;
  book: AccountBook;
  save: (book: AccountBook) => void;
  wallet: WalletState;
}): ReactNode {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = role === "primary" ? book.primary : book.separate;
  const other = role === "primary" ? book.separate : book.primary;
  const letter = ROLE_LETTER[role];
  const connected = wallet.address;
  const connectedIsOther = sameAddress(connected, other?.address);

  function addConnected(): void {
    if (connected === null) return;
    const result = addAccount(book, save, {
      address: connected,
      role,
      label: identity !== null && sameAddress(identity.address, connected) ? identity.label : "",
      watchOnly: false,
    });
    setError(result.ok ? null : result.message);
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`account-slot-${letter.toLowerCase()}`}
      className={cx(
        "relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl border bg-raised p-5 shadow-card",
        identity === null ? "border-dashed border-line-strong" : "border-line",
      )}
    >
      <span aria-hidden="true" className={cx("absolute inset-x-0 top-0 h-1", letter === "A" ? "bg-account-a" : "bg-account-b")} />
      <div className="flex items-start gap-3">
        <AccountLetter account={letter} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="type-eyebrow text-ink-3">
            Account {letter} · {ROLE_COPY[role].name}
          </h3>
          {identity === null ? (
            <>
              <p className="text-title font-semibold tracking-tight text-ink">{ROLE_COPY[role].empty}</p>
              <p className="text-small text-ink-2">{ROLE_COPY[role].explain}</p>
            </>
          ) : null}
        </div>
      </div>
      {identity === null ? (
        <>
          {connected !== null && !connectedIsOther ? (
            <Button size="md" tone={letter === "A" ? "a" : "b"} leading={<UserPlus aria-hidden="true" className="size-3.5" />} onClick={addConnected}>
              Use connected wallet {shortAddress(connected)}
            </Button>
          ) : null}
          {connected === null && role === "primary" ? (
            <div className="flex flex-col gap-1.5">
              <ConnectWalletButton wallet={wallet} size="md" tone="a" variant="primary" block />
              <p className="text-caption text-ink-3">Connect the wallet that holds your positions. Sidecar can then sign for it.</p>
            </div>
          ) : null}
          {connected !== null && connectedIsOther ? (
            <p className="text-small text-ink-2">
              The connected wallet is already account {letter === "A" ? "B" : "A"}. To add a different wallet here, switch
              accounts in your wallet app, or watch its address below.
            </p>
          ) : null}
          {role === "primary" && !(connected !== null && connectedIsOther) ? (
            <>
              <PrimaryReads />
              <details className="group mt-auto border-t border-dashed border-line-strong pt-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xs text-small font-medium text-ink-2 focus-ring hover:text-ink pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
                  Or watch an address instead
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-3 transition-transform duration-fast group-open:rotate-180" />
                </summary>
                <div className="pt-3">
                  <PasteAddressForm role={role} book={book} save={save} />
                </div>
              </details>
            </>
          ) : (
            <PasteAddressForm role={role} book={book} save={save} />
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <AccountBadge account={letter} label={identity.label} address={identity.address} shortAddress={shortAddress(identity.address)} />
            {identity.watchOnly === true ? (
              <StatusPill size="sm" icon={Eye}>
                Watch-only
              </StatusPill>
            ) : null}
            {sameAddress(identity.address, connected) ? (
              <StatusPill size="sm" tone="positive">
                Connected
              </StatusPill>
            ) : null}
          </div>
          {editing ? (
            <LabelEditor identity={identity} book={book} save={save} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {identity.watchOnly === true && sameAddress(identity.address, connected) ? (
                <Button size="sm" tone={letter === "A" ? "a" : "b"} variant="secondary" onClick={addConnected}>
                  Sign with the connected wallet
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" leading={<PenLine aria-hidden="true" className="size-3.5" />} onClick={() => setEditing(true)}>
                Edit label
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leading={<X aria-hidden="true" className="size-3.5" />}
                onClick={() => save(withoutAccount(book, role))}
              >
                Remove account {letter}
              </Button>
            </div>
          )}
        </>
      )}
      {error !== null ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function AccountSummary({ identity, letter, connected }: { identity: AccountIdentity; letter: "A" | "B"; connected: string | null }): ReactNode {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <AccountBadge account={letter} label={identity.label} address={identity.address} shortAddress={shortAddress(identity.address)} size="sm" />
      {identity.watchOnly === true ? (
        <StatusPill size="sm" icon={Eye}>
          Watch-only
        </StatusPill>
      ) : null}
      {sameAddress(identity.address, connected) ? (
        <StatusPill size="sm" tone="positive">
          Connected
        </StatusPill>
      ) : null}
    </span>
  );
}

const SAVED_NOTE = "Saved in this browser only: addresses and labels, never keys.";

export function AccountSetup({
  book,
  save,
  warnings,
  wallet,
}: {
  book: AccountBook;
  save: (book: AccountBook) => void;
  warnings: string[];
  wallet: WalletState;
}): ReactNode {
  const headingId = useId();
  const slotsId = useId();
  const [managing, setManaging] = useState(false);
  const complete = book.primary !== null && book.separate !== null;
  const empty = book.primary === null && book.separate === null;
  const expanded = !complete || managing;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="account-setup"
      className={cx(
        "flex min-w-0 flex-col gap-4",
        complete ? "rounded-xl border border-line bg-panel px-4 py-3 shadow-card md:px-5" : "py-2",
      )}
    >
      {complete ? null : (
        <div className="flex flex-col gap-3">
          <h2 id={headingId} className="type-eyebrow text-ink-3">
            Accounts
          </h2>
          {/* Heading size, not display: the comparison's headline is the one display line on this screen. */}
          <p className="max-w-headline type-display text-heading text-ink md:text-display">
            {empty ? "Start with two wallets." : book.primary === null ? "Add the wallet with your positions." : "Add the second wallet."}
          </p>
          <p className="max-w-measure text-lead text-ink-2">
            Sidecar compares one order held in two places. A holds your positions, B gets its own margin. You pick per trade.
          </p>
        </div>
      )}
      {warnings.length > 0 ? (
        <InlineAlert tone="warning" title="Some saved accounts were ignored">
          {warnings.join(" ")}
        </InlineAlert>
      ) : null}
      {book.primary !== null && book.separate !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-testid="account-summary">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            <h2 id={headingId} className="type-eyebrow text-ink-3">
              Accounts
            </h2>
            <AccountSummary identity={book.primary} letter="A" connected={wallet.address} />
            <AccountSummary identity={book.separate} letter="B" connected={wallet.address} />
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={managing}
            aria-controls={slotsId}
            trailing={<ChevronDown aria-hidden="true" className={managing ? "size-3.5 rotate-180" : "size-3.5"} />}
            onClick={() => setManaging((open) => !open)}
          >
            Manage accounts
          </Button>
        </div>
      ) : null}
      {expanded ? (
        <div id={slotsId} className="grid gap-4 md:grid-cols-2">
          <AccountSlot role="primary" book={book} save={save} wallet={wallet} />
          <AccountSlot role="separate" book={book} save={save} wallet={wallet} />
        </div>
      ) : null}
      <p className="text-caption text-ink-3">{SAVED_NOTE}</p>
    </section>
  );
}

/** Stands in for the accounts strip in its collapsed, both-accounts-set shape. */
export function AccountSetupSkeleton(): ReactNode {
  return (
    <section aria-label="Accounts" aria-busy="true" className="flex flex-col gap-4 rounded-xl border border-line bg-panel px-4 py-3 shadow-card md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="type-eyebrow text-ink-3">Accounts</span>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-8 w-36 pointer-coarse:h-10" />
      </div>
      <p className="text-caption text-ink-3">{SAVED_NOTE}</p>
    </section>
  );
}
