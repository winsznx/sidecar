"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

import { parseTxHashParam } from "./receipt-model";

export interface ReceiptLookupFormProps {
  /** Id of the heading that names this form. */
  labelledBy: string;
}

/** Opens any Hideki transaction's receipt by hash. Invalid input is explained in place and never navigates. */
export function ReceiptLookupForm({ labelledBy }: ReceiptLookupFormProps): ReactNode {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = parseTxHashParam(value);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(null);
    router.push(`/receipt/${parsed.hash}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby={labelledBy} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <TextField
        className="min-w-0 flex-1"
        label="Transaction hash"
        hint="0x followed by 64 hex characters."
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        inputClassName="type-data"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error !== null) setError(null);
        }}
        error={error ?? undefined}
      />
      <Button type="submit" variant="primary" className="sm:mt-6">
        Open receipt
      </Button>
    </form>
  );
}
