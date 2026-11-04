"use client";

import { CircleAlert } from "lucide-react";
import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { cx } from "./cx";

export interface TextFieldProps extends Omit<ComponentPropsWithRef<"input">, "size" | "prefix"> {
  label: ReactNode;
  /** Persistent guidance under the input, e.g. "Min 0.00013 BTC, steps of 0.00001". */
  hint?: ReactNode;
  /** Shown under the hint (which stays visible) and marks the input invalid. */
  error?: ReactNode;
  /** Unit or short affix after the value, e.g. "USDso". */
  suffix?: ReactNode;
  prefix?: ReactNode;
  /** Small control on the label row, e.g. a "Use max" ghost button. */
  labelAction?: ReactNode;
  size?: "md" | "lg";
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  inputClassName?: string;
}

export function TextField({
  label,
  hint,
  error,
  suffix,
  prefix,
  labelAction,
  size = "md",
  hideLabel = false,
  id,
  className,
  inputClassName,
  disabled,
  "aria-describedby": describedBy,
  ...rest
}: TextFieldProps): ReactNode {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const invalid = error !== undefined && error !== null && error !== false;

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <div className={cx("flex items-baseline justify-between gap-3", hideLabel && !labelAction && "sr-only")}>
        <label htmlFor={inputId} className={cx("text-caption font-medium text-ink-2", hideLabel && "sr-only")}>
          {label}
        </label>
        {labelAction}
      </div>

      <div
        className={cx(
          "flex min-w-0 items-center rounded-sm border transition-colors duration-fast ease-standard",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus",
          disabled
            ? "cursor-not-allowed border-dashed border-line-strong bg-sunken"
            : cx("bg-raised shadow-raised", invalid ? "border-danger" : "border-control hover:border-ink-3"),
          size === "lg" ? "h-12" : "h-10 pointer-coarse:h-11",
        )}
      >
        {prefix ? <span className="pl-3 text-small text-ink-3">{prefix}</span> : null}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={cx(describedBy, hint !== undefined && hintId, invalid && errorId) || undefined}
          className={cx(
            "h-full min-w-0 flex-1 bg-transparent px-3 text-ink tabular outline-none placeholder:text-ink-3 disabled:cursor-not-allowed disabled:text-ink-3",
            size === "lg" ? "text-title" : "text-body",
            inputClassName,
          )}
          {...rest}
        />
        {suffix ? <span className="shrink-0 pr-3 text-small text-ink-3">{suffix}</span> : null}
      </div>

      {hint !== undefined ? (
        <p id={hintId} className="text-caption text-ink-3">
          {hint}
        </p>
      ) : null}
      {invalid ? (
        <p id={errorId} className="flex items-start gap-1.5 text-caption text-danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" strokeWidth={2.5} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
