"use client";

import type { ReactNode } from "react";

import { cx } from "./cx";
import { TextField, type TextFieldProps } from "./text-field";

export interface NumberFieldProps extends Omit<TextFieldProps, "type" | "inputMode" | "value" | "defaultValue" | "onChange"> {
  /** The raw text the trader typed. It is never parsed here, so no precision is lost on the way to bigint. */
  value: string;
  onValueChange: (value: string) => void;
  align?: "start" | "end";
}

/**
 * Decimal entry for prices and sizes. Uses a text input with a decimal keypad on mobile,
 * because type="number" rounds through floating point and rewrites what the trader typed.
 */
export function NumberField({ value, onValueChange, align = "start", inputClassName, ...rest }: NumberFieldProps): ReactNode {
  return (
    <TextField
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      inputClassName={cx(align === "end" && "text-right", inputClassName)}
    />
  );
}
