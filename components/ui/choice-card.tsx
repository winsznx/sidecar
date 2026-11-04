"use client";

import { useId, useRef, type MouseEvent, type ReactNode } from "react";

import { cx } from "./cx";
import type { RouteTone } from "./types";

export interface ChoiceCardGroupProps {
  /** Visible question the cards answer, e.g. "Where should this trade live?". */
  legend: ReactNode;
  hideLegend?: boolean;
  /** Restyle the legend, e.g. to set it in the display face when it is the section headline. */
  legendClassName?: string;
  /** Content between the legend and the cards. */
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Fieldset wrapper. The cards inside share a `name`, so arrow keys move between them. */
export function ChoiceCardGroup({
  legend,
  hideLegend = false,
  legendClassName,
  intro,
  children,
  className,
}: ChoiceCardGroupProps): ReactNode {
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className={cx(hideLegend ? "sr-only" : (legendClassName ?? "mb-3 text-title font-semibold text-ink"))}>
        {legend}
      </legend>
      {intro}
      {children}
    </fieldset>
  );
}

const TONE: Record<RouteTone, { band: string; checkedBand: string; checked: string; radio: string }> = {
  neutral: {
    band: "bg-line-strong",
    checkedBand: "bg-ink",
    checked: "border-ink-3 bg-raised shadow-float",
    radio: "border-ink bg-ink",
  },
  a: {
    band: "bg-account-a-line",
    checkedBand: "bg-account-a",
    checked: "border-account-a bg-account-a-soft/60 shadow-float",
    radio: "border-account-a bg-account-a",
  },
  b: {
    band: "bg-account-b-line",
    checkedBand: "bg-account-b",
    checked: "border-account-b bg-account-b-soft/60 shadow-float",
    radio: "border-account-b bg-account-b",
  },
};

export interface ChoiceCardProps {
  /** Shared by every card in the group. */
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  tone?: RouteTone;
  title: ReactNode;
  /** Short summary read with the radio, e.g. "Shares collateral with your ETH position". */
  description?: ReactNode;
  /** Top row content, e.g. an AccountBadge. */
  header?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * One selectable option with rich content. A native radio carries the semantics (labelled by the
 * title, described by the summary); the whole card is a click target, except nested controls.
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  tone = "neutral",
  title,
  description,
  header,
  children,
  footer,
  disabled = false,
  className,
}: ChoiceCardProps): ReactNode {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = TONE[tone];

  function handleCardClick(event: MouseEvent<HTMLDivElement>): void {
    if (disabled) return;
    const target = event.target;
    const nestedControl =
      target instanceof Element &&
      target !== inputRef.current &&
      target.closest("a, button, input, select, textarea, label") !== null;
    if (!nestedControl) onSelect();
  }

  return (
    <div
      data-state={checked ? "checked" : "unchecked"}
      data-disabled={disabled || undefined}
      onClick={handleCardClick}
      className={cx(
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border transition-[border-color,background-color,box-shadow] duration-base ease-standard",
        "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus",
        checked ? styles.checked : disabled ? "border-dashed border-line-strong bg-transparent" : "border-line bg-panel shadow-card",
        disabled ? "cursor-not-allowed" : !checked && "cursor-pointer hover:border-line-strong hover:shadow-float",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("absolute inset-x-0 top-0 h-0.5", styles.band)} />
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-x-0 top-0 h-1 origin-left transition-transform duration-slow ease-standard",
          styles.checkedBand,
          checked ? "scale-x-100" : "scale-x-0",
        )}
      />
      <input
        ref={inputRef}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        className="sr-only"
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cx(
              "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-fast ease-standard",
              checked ? styles.radio : disabled ? "border-ink-4" : "border-control",
            )}
          >
            <span
              className={cx(
                "size-1.5 rounded-full bg-ink-inverse transition-transform duration-fast",
                checked ? "scale-100" : "scale-0",
              )}
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p
              id={titleId}
              className={cx(
                "text-title font-semibold leading-snug tracking-tight",
                disabled ? "text-ink-2" : "text-ink",
              )}
            >
              {title}
            </p>
            {description !== undefined ? (
              <p id={descriptionId} className="text-small text-ink-2">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {header}
        {children}
      </div>
      {footer !== undefined ? <div className="border-t border-dashed border-line-strong px-4 py-3">{footer}</div> : null}
    </div>
  );
}
