import { getAddress, zeroAddress, type Address } from "viem";

import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { shortAddress } from "@/lib/format/units";

/** localStorage key for saved account labels. Addresses and labels only, never secrets. */
export const ACCOUNT_STORAGE_KEY = "sidecar.accounts.v1";
export const MAX_LABEL_LENGTH = 32;

const STORAGE_VERSION = 1;
const STORED_FIELDS = new Set(["address", "label", "role", "addedAt", "watchOnly"]);

export type AccountRole = "primary" | "separate";

export interface AccountIdentity {
  /** EIP-55 checksummed. */
  address: Address;
  label: string;
  role: AccountRole;
  /** ISO 8601. */
  addedAt: string;
  /** Added to read only. Sidecar never offers to sign for a watch-only account. */
  watchOnly?: boolean;
}

export type IdentityIssueCode =
  | "INVALID_ADDRESS"
  | "BAD_CHECKSUM"
  | "ZERO_ADDRESS"
  | "SAME_ADDRESS"
  | "INVALID_ROLE"
  | "INVALID_TIME";

export interface IdentityIssue {
  code: IdentityIssueCode;
  message: string;
}

export type AddressResult = { ok: true; address: Address } | { ok: false; issue: IdentityIssue };

export type IdentityResult =
  | { ok: true; identity: AccountIdentity }
  | { ok: false; issues: IdentityIssue[] };

export interface AccountBook {
  primary: AccountIdentity | null;
  separate: AccountIdentity | null;
}

export const EMPTY_ACCOUNT_BOOK: AccountBook = Object.freeze({ primary: null, separate: null });

export type AccountBookResult = { ok: true; book: AccountBook } | { ok: false; issues: IdentityIssue[] };

export interface ParsedAccountBook {
  book: AccountBook;
  /** Plain-language notes about saved data that was ignored. */
  warnings: string[];
}

export type SignerStatus = "ready" | "not-connected" | "wrong-chain" | "mismatch" | "watch-only";

export interface ConnectedWallet {
  address: Address;
  /** `null` when the wallet did not report a chain. */
  chainId: number | null;
}

export interface SignerAuthority {
  canSign: boolean;
  status: SignerStatus;
  message: string;
  /** The account that must sign. */
  expected: Address | null;
  connected: Address | null;
  connectedChainId: number | null;
  addressMatches: boolean;
  chainMatches: boolean;
}

export function isAccountRole(value: unknown): value is AccountRole {
  return value === "primary" || value === "separate";
}

export function defaultLabel(role: AccountRole): string {
  return role === "primary" ? "Primary account" : "Second wallet";
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Accepts a 0x address in one case or with a correct EIP-55 checksum, and returns it
 * checksummed. A mixed-case address with a wrong checksum is a typo, so it is refused
 * rather than silently "fixed".
 */
export function normalizeAddress(input: string): AddressResult {
  const trimmed = input.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return addressFailure("INVALID_ADDRESS", "Enter a full 0x address (42 characters).");
  }
  const hex = trimmed.slice(2);
  const singleCase = hex === hex.toLowerCase() || hex === hex.toUpperCase();
  const checksummed = getAddress(trimmed);
  if (!singleCase && checksummed !== trimmed) {
    return addressFailure("BAD_CHECKSUM", "This address has a checksum error. Copy it again from your wallet.");
  }
  if (sameAddress(checksummed, zeroAddress)) {
    return addressFailure("ZERO_ADDRESS", "The zero address cannot hold a margin account.");
  }
  return { ok: true, address: checksummed };
}

/**
 * Cleans a user label for display. Invisible and direction-override characters are
 * removed, and so is anything shaped like an address, because a label reading "0xB…"
 * on account A would make the active signer ambiguous.
 */
export function sanitizeLabel(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const visible = Array.from(raw.normalize("NFKC"))
    .filter((character) => !isInvisible(character.codePointAt(0) ?? 0))
    .join("");
  const cleaned = visible
    .replace(/0x[0-9a-f]{4,}/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const clipped = Array.from(cleaned).slice(0, MAX_LABEL_LENGTH).join("").trim();
  return clipped === "" ? fallback : clipped;
}

export function createAccountIdentity(input: {
  address: string;
  role: AccountRole;
  label?: unknown;
  nowMs: number;
  watchOnly?: boolean;
}): IdentityResult {
  const issues: IdentityIssue[] = [];
  const address = normalizeAddress(input.address);
  if (!address.ok) issues.push(address.issue);
  if (!isAccountRole(input.role)) {
    issues.push({ code: "INVALID_ROLE", message: "Choose whether this is your primary account or a second wallet." });
  }
  const addedAt = isoFromMs(input.nowMs);
  if (addedAt === null) issues.push({ code: "INVALID_TIME", message: "The time this account was added is invalid." });
  if (!address.ok || !isAccountRole(input.role) || addedAt === null) return { ok: false, issues };

  const identity: AccountIdentity = {
    address: address.address,
    label: sanitizeLabel(input.label, defaultLabel(input.role)),
    role: input.role,
    addedAt,
  };
  if (input.watchOnly === true) identity.watchOnly = true;
  return { ok: true, identity };
}

/**
 * The second wallet must be a different address. Under cross margin one address is one
 * MarginBank account, so the same address can never be presented as an independently
 * funded account.
 */
export function validateAccountPair(
  primary: AccountIdentity | null,
  separate: AccountIdentity | null,
): IdentityIssue[] {
  if (primary && separate && sameAddress(primary.address, separate.address)) {
    return [
      {
        code: "SAME_ADDRESS",
        message:
          "Your second wallet must be a different address from your primary account. The same address shares one margin balance.",
      },
    ];
  }
  return [];
}

/** Puts an identity into its role's slot, refusing a pairing that repeats one address. */
export function withAccount(book: AccountBook, identity: AccountIdentity): AccountBookResult {
  const next: AccountBook =
    identity.role === "primary" ? { ...book, primary: identity } : { ...book, separate: identity };
  const issues = validateAccountPair(next.primary, next.separate);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, book: next };
}

export function withoutAccount(book: AccountBook, role: AccountRole): AccountBook {
  return role === "primary" ? { ...book, primary: null } : { ...book, separate: null };
}

/**
 * Whether the connected wallet can sign for `identity` right now. Being in the account
 * list is never authority to sign: the connected address and chain must both match.
 */
export function signerAuthority(input: {
  identity: AccountIdentity | null;
  connected: ConnectedWallet | null;
}): SignerAuthority {
  const { identity, connected } = input;
  const base = {
    expected: identity?.address ?? null,
    connected: connected?.address ?? null,
    connectedChainId: connected?.chainId ?? null,
    addressMatches: identity !== null && connected !== null && sameAddress(identity.address, connected.address),
    chainMatches: connected?.chainId === HIDEKI_CHAIN_ID,
  };

  if (identity === null) {
    return { ...base, canSign: false, status: "not-connected", message: "Add an account before signing." };
  }
  const target = shortAddress(identity.address);
  if (identity.watchOnly === true) {
    return {
      ...base,
      canSign: false,
      status: "watch-only",
      message: `${target} is watch-only. Sidecar can read it but cannot sign for it.`,
    };
  }
  if (connected === null) {
    return { ...base, canSign: false, status: "not-connected", message: `Connect ${target} to sign this order.` };
  }
  if (!base.addressMatches) {
    return {
      ...base,
      canSign: false,
      status: "mismatch",
      message: `Wallet mismatch: switch to ${target} before signing.`,
    };
  }
  if (!base.chainMatches) {
    return {
      ...base,
      canSign: false,
      status: "wrong-chain",
      message: `Switch to Hideki (${HIDEKI_CHAIN_ID}) to sign.`,
    };
  }
  return {
    ...base,
    canSign: true,
    status: "ready",
    message: `Signing from ${target} on Hideki (${HIDEKI_CHAIN_ID}).`,
  };
}

/** Serialises only addresses, labels, roles and dates. Any other field is dropped. */
export function serializeAccountBook(book: AccountBook): string {
  const accounts = [book.primary, book.separate]
    .filter((identity): identity is AccountIdentity => identity !== null)
    .map((identity) => ({
      address: identity.address,
      label: identity.label,
      role: identity.role,
      addedAt: identity.addedAt,
      ...(identity.watchOnly === true ? { watchOnly: true } : {}),
    }));
  return JSON.stringify({ v: STORAGE_VERSION, accounts });
}

/**
 * Reads a saved account record. Corrupt, foreign or tampered data degrades to fewer
 * accounts plus a warning; it never throws and never carries unknown fields forward.
 */
export function parseAccountBook(raw: string | null | undefined): ParsedAccountBook {
  if (raw === null || raw === undefined || raw.trim() === "") return { book: EMPTY_ACCOUNT_BOOK, warnings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { book: EMPTY_ACCOUNT_BOOK, warnings: ["Saved accounts could not be read and were ignored."] };
  }
  if (!isRecord(parsed) || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.accounts)) {
    return { book: EMPTY_ACCOUNT_BOOK, warnings: ["Saved accounts are in an unknown format and were ignored."] };
  }

  const warnings = new Set<string>();
  const identities = parsed.accounts
    .map((entry: unknown) => storedIdentity(entry, warnings))
    .filter((identity): identity is AccountIdentity => identity !== null);
  // The primary is placed first whatever the stored order, so a second wallet that
  // repeats its address is the entry dropped, never the primary itself.
  const ordered = [
    ...identities.filter((identity) => identity.role === "primary"),
    ...identities.filter((identity) => identity.role === "separate"),
  ];
  let book: AccountBook = EMPTY_ACCOUNT_BOOK;
  for (const identity of ordered) {
    if (book[identity.role] !== null) {
      warnings.add(`Ignored an extra saved ${identity.role === "primary" ? "primary account" : "second wallet"}.`);
      continue;
    }
    const placed = withAccount(book, identity);
    if (!placed.ok) {
      warnings.add("Ignored a saved second wallet that repeats the primary address.");
      continue;
    }
    book = placed.book;
  }
  return { book, warnings: [...warnings] };
}

function storedIdentity(entry: unknown, warnings: Set<string>): AccountIdentity | null {
  if (!isRecord(entry)) {
    warnings.add("Ignored a saved account that is not readable.");
    return null;
  }
  if (Object.keys(entry).some((key) => !STORED_FIELDS.has(key))) {
    warnings.add("Ignored unexpected fields in saved accounts.");
  }
  const address = typeof entry.address === "string" ? normalizeAddress(entry.address) : null;
  if (address === null || !address.ok) {
    warnings.add("Ignored a saved account with an invalid address.");
    return null;
  }
  if (!isAccountRole(entry.role)) {
    warnings.add("Ignored a saved account with an unknown role.");
    return null;
  }
  const addedAt = typeof entry.addedAt === "string" ? isoFromMs(Date.parse(entry.addedAt)) : null;
  if (addedAt === null) {
    warnings.add("Ignored a saved account with an invalid date.");
    return null;
  }
  const identity: AccountIdentity = {
    address: address.address,
    label: sanitizeLabel(entry.label, defaultLabel(entry.role)),
    role: entry.role,
    addedAt,
  };
  if (entry.watchOnly === true) identity.watchOnly = true;
  return identity;
}

function addressFailure(code: IdentityIssueCode, message: string): AddressResult {
  return { ok: false, issue: { code, message } };
}

function isoFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** C0/C1 controls, zero-width characters, bidi embeddings/overrides/isolates, BOM. */
function isInvisible(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}
