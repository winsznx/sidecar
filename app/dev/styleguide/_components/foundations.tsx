"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { cx } from "@/components/ui/cx";

import { Specimen } from "./guide-section";

const COLOR_GROUPS: ReadonlyArray<{ title: string; tokens: ReadonlyArray<{ name: string; swatch: string }> }> = [
  {
    title: "Surfaces and lines",
    tokens: [
      { name: "canvas", swatch: "bg-canvas" },
      { name: "panel", swatch: "bg-panel" },
      { name: "raised", swatch: "bg-raised" },
      { name: "sunken", swatch: "bg-sunken" },
      { name: "hover", swatch: "bg-hover" },
      { name: "line", swatch: "bg-line" },
      { name: "line-strong", swatch: "bg-line-strong" },
      { name: "control", swatch: "bg-control" },
    ],
  },
  {
    title: "Ink",
    tokens: [
      { name: "ink", swatch: "bg-ink" },
      { name: "ink-2", swatch: "bg-ink-2" },
      { name: "ink-3", swatch: "bg-ink-3" },
      { name: "ink-4", swatch: "bg-ink-4" },
      { name: "key", swatch: "bg-key" },
      { name: "ink-inverse", swatch: "bg-ink-inverse" },
    ],
  },
  {
    title: "Marker",
    tokens: [
      { name: "accent", swatch: "bg-accent" },
      { name: "accent-hover", swatch: "bg-accent-hover" },
      { name: "accent-line", swatch: "bg-accent-line" },
      { name: "accent-ink", swatch: "bg-accent-ink" },
    ],
  },
  {
    title: "Accounts",
    tokens: [
      { name: "account-a", swatch: "bg-account-a" },
      { name: "account-a-soft", swatch: "bg-account-a-soft" },
      { name: "account-a-line", swatch: "bg-account-a-line" },
      { name: "account-b", swatch: "bg-account-b" },
      { name: "account-b-soft", swatch: "bg-account-b-soft" },
      { name: "account-b-line", swatch: "bg-account-b-line" },
    ],
  },
  {
    title: "Direction and risk",
    tokens: [
      { name: "long", swatch: "bg-long" },
      { name: "short", swatch: "bg-short" },
      { name: "positive", swatch: "bg-positive" },
      { name: "warning", swatch: "bg-warning" },
      { name: "danger", swatch: "bg-danger" },
      { name: "hatch", swatch: "bg-hatch" },
    ],
  },
];

/** Reads the resolved value of a surface variable, so the page always shows what the CSS ships. */
function useCssVariable(name: string): [RefObject<HTMLSpanElement | null>, string] {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (ref.current === null) return;
    setValue(getComputedStyle(ref.current).getPropertyValue(name).trim());
  }, [name]);
  return [ref, value];
}

function Swatch({ name, swatch }: { name: string; swatch: string }): ReactNode {
  const [ref, value] = useCssVariable(`--sc-${name}`);
  return (
    <li className="flex min-w-0 items-center gap-2.5">
      <span ref={ref} aria-hidden="true" className={cx("size-8 shrink-0 rounded-sm border border-line", swatch)} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-small font-medium text-ink">{name}</span>
        <span className="type-data text-caption text-ink-3">{value || " "}</span>
      </span>
    </li>
  );
}

export function ColorTokens(): ReactNode {
  return (
    <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-5">
      {COLOR_GROUPS.map((group) => (
        <Specimen key={group.title} label={group.title}>
          <ul className="flex flex-col gap-2.5">
            {group.tokens.map((token) => (
              <Swatch key={token.name} {...token} />
            ))}
          </ul>
        </Specimen>
      ))}
    </div>
  );
}

const TYPE_SCALE: ReadonlyArray<{ token: string; className: string; sample: string; role: string }> = [
  { token: "hero", className: "type-hero text-hero", sample: "Its own margin.", role: "Hero, 52 to 128 fluid, 0.92 leading, -0.05em. Once per page." },
  { token: "display-xl", className: "type-hero text-display-xl", sample: "Two places to hold it.", role: "Band and major sections, 44 to 88 fluid." },
  { token: "section", className: "type-display text-section", sample: "Where should this trade live?", role: "Section headlines, 36 to 64 fluid." },
  { token: "display-lg", className: "type-display text-display-lg", sample: "38,357,692", role: "Display, 48/50. Stat size xl." },
  { token: "display", className: "type-display text-display", sample: "What the chain shows", role: "Display, 36/40. Screen titles." },
  { token: "heading", className: "text-heading font-semibold", sample: "Exact calculations", role: "Section heading, 24/30." },
  { token: "figure", className: "text-figure font-semibold", sample: "12,408.19 USDso", role: "Figures, 21/26." },
  { token: "title", className: "text-title font-semibold", sample: "Give this trade its own margin", role: "Panel and card titles, 18/24." },
  { token: "lead", className: "text-lead", sample: "Separate accounts use capital less efficiently.", role: "Prose on records, 16/24." },
  { token: "body", className: "text-body", sample: "BTC in your second wallet uses a different margin balance.", role: "Default UI text, 14/22." },
  { token: "small", className: "text-small", sample: "Initial margin for this trade 50.32 USDso", role: "Dense rows and tables, 13/20." },
  { token: "caption", className: "text-caption", sample: "Min 0.00013 BTC, steps of 0.00001", role: "Hints and labels, 12/18." },
  { token: "micro", className: "type-eyebrow", sample: "03 · Choose the account", role: "Eyebrows and source tags, 11/16 mono." },
];

export function TypeScale(): ReactNode {
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {TYPE_SCALE.map((step) => (
        <li key={step.token} className="grid gap-1 py-3 md:grid-cols-[10rem_minmax(0,1fr)] md:items-baseline md:gap-6">
          <span className="flex flex-col">
            <span className="type-data text-small text-ink">text-{step.token}</span>
            <span className="text-caption text-ink-3">{step.role}</span>
          </span>
          <span className={cx("min-w-0 text-ink", step.className)}>{step.sample}</span>
        </li>
      ))}
    </ul>
  );
}

export function ShapeAndMotion(): ReactNode {
  return (
    <div className="grid gap-10 md:grid-cols-3">
      <Specimen label="Radius grows with the container">
        <ul className="flex flex-col gap-3">
          {[
            ["rounded-xs", "4px. Tags, badges, kbd"],
            ["rounded-sm", "8px. Buttons, inputs, segments"],
            ["rounded-md", "12px. Cards inside panels, unavailable blocks"],
            ["rounded-lg", "16px. Panels, route cards, alerts"],
            ["rounded-xl", "22px. Floating cards, dialogs, records"],
            ["rounded-2xl", "32px. Bands"],
            ["rounded-full", "Status pills and account B only"],
          ].map(([radius, use]) => (
            <li key={radius} className="flex items-center gap-3">
              <span aria-hidden="true" className={cx("h-8 w-12 shrink-0 border border-ink-3 bg-raised", radius)} />
              <span className="flex flex-col">
                <span className="type-data text-small text-ink">{radius}</span>
                <span className="text-caption text-ink-3">{use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Specimen>
      <Specimen label="Elevation">
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line bg-raised p-3 text-small text-ink-2 shadow-raised">shadow-raised. Controls, chips, kbd.</div>
          <div className="rounded-md border border-line bg-panel p-3 text-small text-ink-2 shadow-card">shadow-card. Panels and route cards.</div>
          <div className="rounded-md border border-line bg-raised p-3 text-small text-ink-2 shadow-float">shadow-float. Floating cards, a selected route.</div>
          <div className="rounded-md border border-line bg-raised p-3 text-small text-ink-2 shadow-overlay">shadow-overlay. Dialogs and sheets.</div>
          <div className="rounded-md border border-line bg-panel p-3 text-small text-ink-2 shadow-sticky">shadow-sticky. The sign bar.</div>
        </div>
      </Specimen>
      <Specimen label="Motion">
        <ul className="flex flex-col gap-2.5 text-small text-ink-2">
          {[
            ["duration-fast", "120ms. Hover, press, segment change"],
            ["duration-base", "200ms. Route selection, dialog in"],
            ["duration-slow", "320ms. Sheet in, identity band, stamp"],
            ["duration-linger", "960ms. Value-change highlight"],
            ["duration-loop", "1600ms. Skeleton shimmer, loading sweep"],
            ["ease-standard", "cubic-bezier(0.2, 0, 0, 1)"],
            ["ease-exit", "cubic-bezier(0.4, 0, 1, 1)"],
          ].map(([token, use]) => (
            <li key={token} className="flex flex-col">
              <span className="type-data text-ink">{token}</span>
              <span className="text-caption text-ink-3">{use}</span>
            </li>
          ))}
          <li className="text-caption text-ink-3">Everything collapses to an instant change under prefers-reduced-motion.</li>
        </ul>
      </Specimen>
    </div>
  );
}
