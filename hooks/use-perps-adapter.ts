"use client";

import { getBrowserMarkets } from "@/lib/dreamdex/client";
import { createPerpsAdapter, type PerpsAdapter } from "@/lib/dreamdex/adapter";

let browserAdapter: PerpsAdapter | null = null;

/** The browser's single adapter. Created on first use so nothing dials the chain during render on the server. */
export function getBrowserAdapter(): PerpsAdapter {
  browserAdapter ??= createPerpsAdapter(getBrowserMarkets());
  return browserAdapter;
}
