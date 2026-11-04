"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { cx } from "@/components/ui/cx";
import type { MarketMeta } from "@/lib/dreamdex/types";

const PAGE_STEP = 10;
// Matches the platform listbox: a pause this long starts a new type-ahead search.
const TYPE_AHEAD_RESET_MS = 500;

function statusNote(market: MarketMeta): string {
  if (market.tradeable === false) return " (not tradeable)";
  if (market.restricted === true) return " (close-only)";
  return "";
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * Select-only combobox: focus stays on the trigger and the active option is announced through
 * aria-activedescendant, so it reads like a native select while each option can carry a logo.
 */
export function MarketPicker({
  markets,
  market,
  onSelect,
  disabled,
}: {
  markets: readonly MarketMeta[];
  market: MarketMeta;
  onSelect: (market: MarketMeta) => void;
  disabled: boolean;
}): ReactNode {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (index: number): string => `${id}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const optionNodes = useRef<Array<HTMLLIElement | null>>([]);
  const typeAhead = useRef({ text: "", at: 0 });

  // Stable, so it runs once when the list mounts rather than on every highlight change.
  const revealActiveOnOpen = useCallback((node: HTMLUListElement | null): void => {
    node?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, []);

  const selectedIndex = Math.max(
    markets.findIndex((candidate) => candidate.pool === market.pool),
    0,
  );

  const moveTo = (index: number): void => {
    const next = clamp(index, markets.length);
    setActive(next);
    optionNodes.current[next]?.scrollIntoView({ block: "nearest" });
  };

  const openAt = (index: number): void => {
    setActive(clamp(index, markets.length));
    setOpen(true);
  };

  const commit = (index: number): void => {
    const next = markets[index];
    setOpen(false);
    if (next !== undefined && next.pool !== market.pool) onSelect(next);
  };

  const findByPrefix = (key: string, from: number): number | null => {
    const now = Date.now();
    const previous = typeAhead.current;
    const text = now - previous.at > TYPE_AHEAD_RESET_MS ? key : previous.text + key;
    typeAhead.current = { text, at: now };
    // Repeating one letter cycles through the markets that start with it, as a native select does.
    const cycling = text.length > 1 && [...text].every((char) => char === text[0]);
    const needle = (cycling ? key : text).toLowerCase();
    const start = cycling || text.length === 1 ? from + 1 : from;
    for (let offset = 0; offset < markets.length; offset += 1) {
      const index = (start + offset) % markets.length;
      if (markets[index]?.displaySymbol.toLowerCase().startsWith(needle)) return index;
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const { key, altKey } = event;
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey;
    const typing = Date.now() - typeAhead.current.at <= TYPE_AHEAD_RESET_MS && typeAhead.current.text !== "";

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || (key === " " && !typing)) {
        event.preventDefault();
        openAt(selectedIndex);
      } else if (key === "Home") {
        event.preventDefault();
        openAt(0);
      } else if (key === "End") {
        event.preventDefault();
        openAt(markets.length - 1);
      } else if (printable) {
        event.preventDefault();
        openAt(findByPrefix(key, selectedIndex) ?? selectedIndex);
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(active + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (altKey) commit(active);
        else moveTo(active - 1);
        return;
      case "Home":
        event.preventDefault();
        moveTo(0);
        return;
      case "End":
        event.preventDefault();
        moveTo(markets.length - 1);
        return;
      case "PageDown":
        event.preventDefault();
        moveTo(active + PAGE_STEP);
        return;
      case "PageUp":
        event.preventDefault();
        moveTo(active - PAGE_STEP);
        return;
      case "Enter":
        event.preventDefault();
        commit(active);
        return;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        commit(active);
        return;
      default:
        break;
    }

    if (key === " " && !typing) {
      event.preventDefault();
      commit(active);
    } else if (printable) {
      event.preventDefault();
      const match = findByPrefix(key, active);
      if (match !== null) moveTo(match);
    }
  };

  const current = markets[selectedIndex] ?? market;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={labelId} className="text-caption font-medium text-ink-2">
        Market
      </span>
      <div className="relative">
        <button
          type="button"
          role="combobox"
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? optionId(active) : undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          className="flex h-10 w-full items-center gap-2 rounded-sm border border-control bg-sunken px-3 text-left text-body text-ink focus-ring disabled:cursor-not-allowed disabled:text-ink-3"
        >
          <TokenLabel symbol={current.baseSymbol} size={20} className="min-w-0 flex-1 truncate">
            {current.displaySymbol}
            <span className="text-ink-3">{statusNote(current)}</span>
          </TokenLabel>
          <ChevronDown
            aria-hidden="true"
            className={cx("size-4 shrink-0 text-ink-3 transition-transform duration-fast", open && "rotate-180")}
          />
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            tabIndex={-1}
            ref={revealActiveOnOpen}
            // Keeps focus on the trigger, so its blur only fires when focus really leaves the picker.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-full z-popover mt-1 max-h-[min(20rem,50vh)] overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-float"
          >
            {markets.map((candidate, index) => {
              const selected = index === selectedIndex;
              return (
                <li
                  key={candidate.pool}
                  id={optionId(index)}
                  ref={(node) => {
                    optionNodes.current[index] = node;
                  }}
                  role="option"
                  aria-selected={selected}
                  data-active={index === active || undefined}
                  onMouseMove={() => {
                    if (index !== active) setActive(index);
                  }}
                  onClick={() => commit(index)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-body text-ink pointer-coarse:min-h-10",
                    index === active && "bg-hover",
                    selected && "font-semibold",
                  )}
                >
                  <TokenLabel symbol={candidate.baseSymbol} className="min-w-0 flex-1 truncate">
                    {candidate.displaySymbol}
                    <span className="font-normal text-ink-3">{statusNote(candidate)}</span>
                  </TokenLabel>
                  {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-ink-2" /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
