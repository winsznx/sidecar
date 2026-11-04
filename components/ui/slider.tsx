"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { useId, type ReactNode } from "react";

import { cx } from "./cx";

export interface SliderProps {
  label: ReactNode;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** The current value as the trader should read it, e.g. "BTC -12% (68,123 USDso)". Also read by screen readers. */
  valueText: string;
  /** Point the fill grows from, e.g. 0 for a +/- price shock. Defaults to `min`. */
  origin?: number;
  minLabel?: string;
  maxLabel?: string;
  /** Right side of the label row, e.g. a SCENARIO provenance badge. */
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function percentOf(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100;
}

/** Scenario input. Its outputs are hypothetical; pair it with SCENARIO provenance on every figure it drives. */
export function Slider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  valueText,
  origin,
  minLabel,
  maxLabel,
  badge,
  disabled,
  className,
}: SliderProps): ReactNode {
  const labelId = useId();
  const start = percentOf(origin ?? min, min, max);
  const end = percentOf(value, min, max);
  const fillLeft = Math.min(start, end);
  const fillWidth = Math.abs(end - start);

  return (
    <div className={cx("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-caption font-medium text-ink-2">
          {label}
        </span>
        {badge}
      </div>
      <p aria-hidden="true" className="text-title font-semibold text-ink tabular">
        {valueText}
      </p>
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={(next) => {
          const [first] = next;
          if (first !== undefined) onValueChange(first);
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="relative flex h-6 touch-none select-none items-center data-[disabled]:opacity-60 pointer-coarse:h-10"
      >
        <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-line">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 bg-warning"
            style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
          />
        </SliderPrimitive.Track>
        {origin !== undefined ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-3 w-0.5 -translate-x-1/2 rounded-full bg-ink-3"
            style={{ left: `${start}%` }}
          />
        ) : null}
        <SliderPrimitive.Thumb
          aria-labelledby={labelId}
          aria-valuetext={valueText}
          className="block size-5 rounded-full border-2 border-warning bg-panel shadow-raised transition-transform duration-fast ease-standard focus-ring hover:scale-110 pointer-coarse:size-7"
        />
      </SliderPrimitive.Root>
      {minLabel !== undefined || maxLabel !== undefined ? (
        <div aria-hidden="true" className="flex justify-between type-data text-caption text-ink-3">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
