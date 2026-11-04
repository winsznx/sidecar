"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "./cx";
import type { AccountRole } from "./types";

/** "0x4181dd…94c0": enough characters on both ends to compare against a wallet. */
export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead + 2)}…${address.slice(-tail)}`;
}

const LETTER_SHAPE: Record<AccountRole, string> = {
  A: "rounded-xs",
  B: "rounded-full",
};

const LETTER_TINT: Record<AccountRole, string> = {
  A: "border-account-a-line bg-account-a-soft text-account-a",
  B: "border-account-b-line bg-account-b-soft text-account-b",
};

const LETTER_SIZE = {
  sm: "size-4.5 text-micro",
  md: "size-6 text-caption",
  lg: "size-8 text-body",
} as const;

export interface AccountLetterProps {
  account: AccountRole;
  size?: keyof typeof LETTER_SIZE;
  /** `on-fill` draws the letter in the current text colour, for use inside a filled A/B button. */
  appearance?: "tinted" | "on-fill";
  className?: string;
}

/**
 * The account's letter in its shape: A is a rounded square (the main body),
 * B is a circle (the docked compartment). Shape, letter and hue always travel together.
 */
export function AccountLetter({ account, size = "md", appearance = "tinted", className }: AccountLetterProps): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center border font-mono font-semibold leading-none",
        LETTER_SHAPE[account],
        appearance === "tinted" ? LETTER_TINT[account] : "border-current text-current",
        LETTER_SIZE[size],
        className,
      )}
    >
      {account}
    </span>
  );
}

type CopyState = "idle" | "copied" | "failed";

const COPY_RESET_MS = 2000;

export interface AccountBadgeProps {
  account: AccountRole;
  /** e.g. "Main account" or "Sidecar account". */
  label: string;
  /** Full 0x address. */
  address: string;
  /** Preformatted short form; defaults to shortenAddress(address). */
  shortAddress?: string;
  copyable?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function AccountBadge({
  account,
  label,
  address,
  shortAddress,
  copyable = true,
  size = "md",
  className,
}: AccountBadgeProps): ReactNode {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState("idle"), COPY_RESET_MS);
  }

  const short = shortAddress ?? shortenAddress(address);

  return (
    <span className={cx("inline-flex max-w-full min-w-0 items-center gap-2", className)}>
      <AccountLetter account={account} size={size === "sm" ? "sm" : "md"} />
      <span className="sr-only">Account {account}, </span>
      <span className={cx("min-w-0 truncate font-medium text-ink", size === "sm" ? "text-small" : "text-body")}>{label}</span>
      <span title={address} className={cx("type-data shrink-0 text-ink-2", size === "sm" ? "text-caption" : "text-small")}>
        {short}
      </span>
      {copyable ? (
        <>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label} address`}
            className={cx(
              "-m-1 inline-flex shrink-0 items-center gap-1 rounded-xs p-1 text-ink-3 transition-colors duration-fast ease-standard focus-ring hover:bg-hover hover:text-ink",
              "pointer-coarse:min-h-10 pointer-coarse:min-w-10 pointer-coarse:justify-center",
            )}
          >
            {copyState === "copied" ? (
              <Check aria-hidden="true" className="size-3.5 text-positive" strokeWidth={2.5} />
            ) : (
              <Copy aria-hidden="true" className="size-3.5" />
            )}
            {copyState === "copied" ? <span className="text-micro font-medium text-positive">Copied</span> : null}
            {copyState === "failed" ? <span className="text-micro font-medium text-danger">Copy failed</span> : null}
          </button>
          <span role="status" className="sr-only">
            {copyState === "copied"
              ? "Address copied"
              : copyState === "failed"
                ? "Copy failed. The browser blocked clipboard access."
                : ""}
          </span>
        </>
      ) : null}
    </span>
  );
}
