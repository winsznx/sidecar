import type { ReactNode } from "react";

import type { KeyValueItem } from "@/components/ui/key-value-list";
import { Stat, type StatSize } from "@/components/ui/stat";
import { Unavailable } from "@/components/ui/unavailable";
import type { Reading, Source } from "@/lib/dreamdex/types";

/** A key-value row for a reading: the formatted value with its source, or a visible unavailable chip. */
export function readingItem<T>(
  id: string,
  label: ReactNode,
  reading: Reading<T>,
  format: (value: T) => ReactNode,
  hint?: ReactNode,
): KeyValueItem {
  if (reading.ok) return { id, label, value: format(reading.value), source: reading.source, hint };
  return { id, label, value: <Unavailable variant="inline" reason={reading.reason} />, hint };
}

/** A key-value row for a value read alongside `source`, or unavailable with `reason` when it is null. */
export function valueItem<T>(
  id: string,
  label: ReactNode,
  value: T | null | undefined,
  source: Source | null | undefined,
  format: (value: T) => ReactNode,
  reason: string,
  hint?: ReactNode,
): KeyValueItem {
  if (value === null || value === undefined || source === null || source === undefined) {
    return { id, label, value: <Unavailable variant="inline" reason={reason} />, hint };
  }
  return { id, label, value: format(value), source, hint };
}

export function ReadingStat<T>({
  label,
  reading,
  format,
  unit,
  size = "sm",
  badge = true,
  note,
}: {
  label: ReactNode;
  reading: Reading<T>;
  format: (value: T) => string;
  unit?: ReactNode;
  size?: StatSize;
  badge?: boolean;
  note?: ReactNode;
}): ReactNode {
  if (!reading.ok) return <Stat state="unavailable" label={label} reason={reading.reason} size={size} note={note} />;
  return (
    <Stat
      state="known"
      label={label}
      value={format(reading.value)}
      unit={unit}
      source={reading.source}
      size={size}
      badge={badge}
      note={note}
    />
  );
}
