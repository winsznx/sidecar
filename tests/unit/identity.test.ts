import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STORAGE_KEY,
  createAccountIdentity,
  EMPTY_ACCOUNT_BOOK,
  normalizeAddress,
  parseAccountBook,
  sanitizeLabel,
  serializeAccountBook,
  signerAuthority,
  validateAccountPair,
  withAccount,
} from "@/lib/wallets/identity";
import {
  NOW_MS,
  PRIMARY_ADDRESS,
  PRIMARY_IDENTITY,
  SEPARATE_ADDRESS,
  SEPARATE_IDENTITY,
} from "@/tests/fixtures/accounts.fixture";

const LOWERCASE_PRIMARY: Address = "0xf07510313917852bc9d6ddaa811a158d7242dcd0";

describe("normalizeAddress", () => {
  it("checksums a single-case address", () => {
    // #given a lowercase address
    // #when normalized
    const result = normalizeAddress(`  ${LOWERCASE_PRIMARY} `);
    // #then it comes back trimmed and checksummed
    expect(result).toEqual({ ok: true, address: PRIMARY_ADDRESS });
  });

  it("refuses typos instead of fixing them", () => {
    // #given a mixed-case address with one letter's case flipped, the zero address and a short string
    const typo = PRIMARY_ADDRESS.replace("bc9D", "bc9d");
    // #when each is normalized
    const codes = [typo, "0x0000000000000000000000000000000000000000", "0x1234"].map((input) => {
      const result = normalizeAddress(input);
      return result.ok ? "ok" : result.issue.code;
    });
    // #then each is refused with its own cause
    expect(codes).toEqual(["BAD_CHECKSUM", "ZERO_ADDRESS", "INVALID_ADDRESS"]);
  });
});

describe("sanitizeLabel", () => {
  it("removes invisible and direction-override characters", () => {
    // #given a label carrying a right-to-left override and a zero-width space
    // #when sanitized
    const label = sanitizeLabel("Main‮​ desk", "Primary account");
    // #then only visible text remains
    expect(label).toBe("Main desk");
  });

  it("strips anything shaped like an address so a label cannot impersonate another account", () => {
    // #given a label that spells out a different wallet's address
    // #when sanitized
    const label = sanitizeLabel("Pay from 0x0DE15c47 wallet", "Primary account");
    // #then the address-like text is gone
    expect(label).toBe("Pay from wallet");
  });

  it("falls back to the role label for empty or non-text input and clips long labels", () => {
    // #given blank, non-string and over-long labels
    // #when sanitized
    const labels = [
      sanitizeLabel("   ", "Second wallet"),
      sanitizeLabel(42, "Second wallet"),
      sanitizeLabel("x".repeat(80), "Second wallet"),
    ];
    // #then each is safe to show
    expect(labels).toEqual(["Second wallet", "Second wallet", "x".repeat(32)]);
  });
});

describe("account identities", () => {
  it("creates a checksummed identity with a sanitized label and the given time", () => {
    // #given a pasted lowercase address
    // #when an identity is created
    const result = createAccountIdentity({ address: LOWERCASE_PRIMARY, role: "primary", label: " Desk A ", nowMs: NOW_MS });
    // #then it is normalized and timestamped from the input time
    expect(result).toEqual({
      ok: true,
      identity: { address: PRIMARY_ADDRESS, label: "Desk A", role: "primary", addedAt: "2026-11-01T12:00:00.000Z" },
    });
  });

  it("T03 never lets the same address stand in as the separate account", () => {
    // #given the primary identity and a second wallet with the same address in another case
    const sameAsPrimary = { ...SEPARATE_IDENTITY, address: LOWERCASE_PRIMARY };
    // #when the pair is checked and stored
    const pairIssues = validateAccountPair(PRIMARY_IDENTITY, sameAsPrimary).map((issue) => issue.code);
    const stored = withAccount({ primary: PRIMARY_IDENTITY, separate: null }, sameAsPrimary);
    // #then both refuse it
    expect([pairIssues, stored.ok]).toEqual([["SAME_ADDRESS"], false]);
  });

  it("accepts two different addresses as primary and separate", () => {
    // #given an empty book
    // #when both identities are added
    const first = withAccount(EMPTY_ACCOUNT_BOOK, PRIMARY_IDENTITY);
    const second = first.ok ? withAccount(first.book, SEPARATE_IDENTITY) : first;
    // #then both are kept
    expect(second).toEqual({ ok: true, book: { primary: PRIMARY_IDENTITY, separate: SEPARATE_IDENTITY } });
  });
});

describe("signerAuthority", () => {
  it("is ready only when the connected wallet is the account, on Hideki", () => {
    // #given the second wallet connected on Hideki
    // #when its authority is checked
    const authority = signerAuthority({ identity: SEPARATE_IDENTITY, connected: { address: SEPARATE_ADDRESS, chainId: 50383 } });
    // #then it can sign and says from where
    expect([authority.canSign, authority.status, authority.message]).toEqual([
      true,
      "ready",
      "Signing from 0x0DE1…b1E0 on Hideki (50383).",
    ]);
  });

  it("tells the trader which wallet to switch to on a mismatch", () => {
    // #given the primary wallet connected while the route needs the second
    // #when authority is checked
    const authority = signerAuthority({ identity: SEPARATE_IDENTITY, connected: { address: PRIMARY_ADDRESS, chainId: 50383 } });
    // #then signing is refused with the expected address
    expect([authority.canSign, authority.status, authority.message]).toEqual([
      false,
      "mismatch",
      "Wallet mismatch: switch to 0x0DE1…b1E0 before signing.",
    ]);
  });

  it("asks for Hideki when the right wallet is on another chain", () => {
    // #given the right wallet on Ethereum mainnet
    // #when authority is checked
    const authority = signerAuthority({ identity: SEPARATE_IDENTITY, connected: { address: SEPARATE_ADDRESS, chainId: 1 } });
    // #then it asks for the chain switch
    expect([authority.canSign, authority.status, authority.message]).toEqual([
      false,
      "wrong-chain",
      "Switch to Hideki (50383) to sign.",
    ]);
  });

  it("never signs for a watch-only account, even when that address is connected", () => {
    // #given a watch-only identity whose address happens to be connected
    const watched = { ...SEPARATE_IDENTITY, watchOnly: true };
    // #when authority is checked
    const authority = signerAuthority({ identity: watched, connected: { address: SEPARATE_ADDRESS, chainId: 50383 } });
    // #then it stays read-only
    expect([authority.canSign, authority.status]).toEqual([false, "watch-only"]);
  });

  it("asks to connect when no wallet is connected", () => {
    // #given no connected wallet
    // #when authority is checked
    const authority = signerAuthority({ identity: PRIMARY_IDENTITY, connected: null });
    // #then it names the wallet to connect
    expect([authority.status, authority.message]).toEqual(["not-connected", "Connect 0xf075…dcd0 to sign this order."]);
  });
});

describe("saved accounts", () => {
  it("uses a versioned storage key", () => {
    // #given the storage key
    // #when read
    // #then it is versioned so a format change cannot be misread
    expect(ACCOUNT_STORAGE_KEY).toBe("sidecar.accounts.v1");
  });

  it("round-trips a book through serialize and parse", () => {
    // #given a book with both accounts, one watch-only
    const book = { primary: PRIMARY_IDENTITY, separate: { ...SEPARATE_IDENTITY, watchOnly: true } };
    // #when serialized and parsed back
    const parsed = parseAccountBook(serializeAccountBook(book));
    // #then nothing changes and nothing is reported
    expect(parsed).toEqual({ book, warnings: [] });
  });

  it("degrades corrupt or foreign data to an empty book with a warning", () => {
    // #given unreadable, wrong-version and empty values
    // #when parsed
    const results = ["{not json", JSON.stringify({ v: 2, accounts: [] }), null].map(parseAccountBook);
    // #then none throws and the first two explain what happened
    expect(results.map((result) => [result.book, result.warnings.length])).toEqual([
      [EMPTY_ACCOUNT_BOOK, 1],
      [EMPTY_ACCOUNT_BOOK, 1],
      [EMPTY_ACCOUNT_BOOK, 0],
    ]);
  });

  it("drops a saved second wallet that repeats the primary address", () => {
    // #given a stored record whose second wallet is the primary in lowercase
    const raw = JSON.stringify({
      v: 1,
      accounts: [
        { address: PRIMARY_ADDRESS, label: "A", role: "primary", addedAt: PRIMARY_IDENTITY.addedAt },
        { address: LOWERCASE_PRIMARY, label: "B", role: "separate", addedAt: SEPARATE_IDENTITY.addedAt },
      ],
    });
    // #when parsed
    const parsed = parseAccountBook(raw);
    // #then the duplicate is not presented as a separate account
    expect([parsed.book.separate, parsed.warnings]).toEqual([
      null,
      ["Ignored a saved second wallet that repeats the primary address."],
    ]);
  });

  it("keeps the primary when a repeating second wallet is stored before it", () => {
    // #given the same duplicate record with the second wallet stored first
    const raw = JSON.stringify({
      v: 1,
      accounts: [
        { address: LOWERCASE_PRIMARY, label: "B", role: "separate", addedAt: SEPARATE_IDENTITY.addedAt },
        { address: PRIMARY_ADDRESS, label: "A", role: "primary", addedAt: PRIMARY_IDENTITY.addedAt },
      ],
    });
    // #when parsed
    const parsed = parseAccountBook(raw);
    // #then the primary survives and the second wallet is the entry dropped
    expect([parsed.book.primary?.address, parsed.book.separate, parsed.warnings]).toEqual([
      PRIMARY_ADDRESS,
      null,
      ["Ignored a saved second wallet that repeats the primary address."],
    ]);
  });

  it("never carries secrets or unknown fields from tampered storage", () => {
    // #given a stored entry that also holds a private key
    const raw = JSON.stringify({
      v: 1,
      accounts: [
        {
          address: SEPARATE_ADDRESS,
          label: "B",
          role: "separate",
          addedAt: SEPARATE_IDENTITY.addedAt,
          privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        },
      ],
    });
    // #when it is parsed and saved again
    const resaved = serializeAccountBook(parseAccountBook(raw).book);
    // #then the key is gone
    expect(resaved).not.toContain("privateKey");
  });

  it("drops entries with invalid addresses, roles or dates", () => {
    // #given three broken entries
    const raw = JSON.stringify({
      v: 1,
      accounts: [
        { address: "0x1234", label: "x", role: "primary", addedAt: PRIMARY_IDENTITY.addedAt },
        { address: SEPARATE_ADDRESS, label: "x", role: "admin", addedAt: PRIMARY_IDENTITY.addedAt },
        { address: SEPARATE_ADDRESS, label: "x", role: "separate", addedAt: "yesterday" },
      ],
    });
    // #when parsed
    const parsed = parseAccountBook(raw);
    // #then nothing is kept and each problem is noted
    expect([parsed.book, parsed.warnings.length]).toEqual([EMPTY_ACCOUNT_BOOK, 3]);
  });
});
