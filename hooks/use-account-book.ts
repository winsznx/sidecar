"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  ACCOUNT_STORAGE_KEY,
  EMPTY_ACCOUNT_BOOK,
  parseAccountBook,
  serializeAccountBook,
  type AccountBook,
  type ParsedAccountBook,
} from "@/lib/wallets/identity";

const SERVER_SNAPSHOT: ParsedAccountBook = { book: EMPTY_ACCOUNT_BOOK, warnings: [] };
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedParsed: ParsedAccountBook = SERVER_SNAPSHOT;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
  } catch (error) {
    console.warn("Sidecar could not read saved accounts; continuing without them.", error);
    return null;
  }
}

// useSyncExternalStore needs a stable object while storage is unchanged, so parse once per raw value.
function getSnapshot(): ParsedAccountBook {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedParsed = parseAccountBook(raw);
  }
  return cachedParsed;
}

function getServerSnapshot(): ParsedAccountBook {
  return SERVER_SNAPSHOT;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === ACCOUNT_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export interface AccountBookStore extends ParsedAccountBook {
  save: (book: AccountBook) => void;
}

/** Saved account labels (addresses only, never secrets), shared across tabs through localStorage. */
export function useAccountBook(): AccountBookStore {
  const parsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const save = useCallback((book: AccountBook): void => {
    try {
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, serializeAccountBook(book));
    } catch (error) {
      console.warn("Sidecar could not save accounts; they will last for this page only.", error);
      cachedRaw = undefined;
      cachedParsed = { book, warnings: ["Accounts could not be saved in this browser and will be forgotten on reload."] };
    }
    for (const listener of listeners) listener();
  }, []);
  return { ...parsed, save };
}
