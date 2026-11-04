"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type CopyState = "idle" | "copied" | "failed";

const RESET_MS = 2000;

export interface CopyValueProps {
  value: string;
  /** What is being copied, for the accessible name, e.g. "transaction hash". */
  label: string;
}

/** A copy control for long identifiers, with visible and announced feedback. */
export function CopyValue({ value, label }: CopyValueProps): ReactNode {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-xs p-1 text-ink-3 transition-colors duration-fast ease-standard focus-ring hover:bg-hover hover:text-ink pointer-coarse:min-h-10 pointer-coarse:min-w-10 pointer-coarse:justify-center"
      >
        {state === "copied" ? (
          <Check aria-hidden="true" className="size-3.5 text-positive" strokeWidth={2.5} />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
        {state === "copied" ? <span className="text-micro font-medium text-positive">Copied</span> : null}
        {state === "failed" ? <span className="text-micro font-medium text-danger">Copy failed</span> : null}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? `Copied ${label}` : state === "failed" ? "Copy failed. The browser blocked clipboard access." : ""}
      </span>
    </>
  );
}
