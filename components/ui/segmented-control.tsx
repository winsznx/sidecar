"use client";

import { RadioGroup } from "radix-ui";
import type { ReactNode } from "react";

import { cx } from "./cx";

export type SegmentTone = "neutral" | "long" | "short" | "a" | "b";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Colour of the option when selected, e.g. Long/Short or account A/B. */
  tone?: SegmentTone;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Accessible group name. Use `labelledBy` instead when a visible label exists. */
  label?: string;
  labelledBy?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Stretch the options to fill the container. */
  block?: boolean;
  name?: string;
  className?: string;
}

const CHECKED_TONE: Record<SegmentTone, string> = {
  neutral: "data-[state=checked]:bg-raised data-[state=checked]:text-ink",
  long: "data-[state=checked]:bg-long-soft data-[state=checked]:text-long",
  short: "data-[state=checked]:bg-short-soft data-[state=checked]:text-short",
  a: "data-[state=checked]:bg-account-a-soft data-[state=checked]:text-account-a",
  b: "data-[state=checked]:bg-account-b-soft data-[state=checked]:text-account-b",
};

/** A single-choice radio group (arrow keys move and select), styled as joined segments. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  labelledBy,
  size = "md",
  disabled,
  block = false,
  name,
  className,
}: SegmentedControlProps<T>): ReactNode {
  function handleValueChange(next: string): void {
    const option = options.find((candidate) => candidate.value === next);
    if (option) onValueChange(option.value);
  }

  return (
    <RadioGroup.Root
      value={value}
      onValueChange={handleValueChange}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      orientation="horizontal"
      disabled={disabled}
      name={name}
      className={cx(
        "gap-0.5 rounded-sm border border-control bg-sunken p-0.5",
        block ? "grid auto-cols-fr grid-flow-col" : "inline-grid w-fit auto-cols-max grid-flow-col",
        className,
      )}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cx(
            "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xs px-3 font-medium text-ink-2",
            "transition-[background-color,color,box-shadow] duration-fast ease-standard focus-ring",
            "data-[state=unchecked]:enabled:hover:text-ink data-[state=checked]:shadow-raised disabled:cursor-not-allowed disabled:text-ink-4",
            size === "sm" ? "h-7 text-small pointer-coarse:h-10" : "h-9 text-body pointer-coarse:h-10",
            CHECKED_TONE[option.tone ?? "neutral"],
          )}
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
