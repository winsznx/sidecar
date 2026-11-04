import type { Address } from "viem";

import { NETWORK } from "@/lib/dreamdex/config";
import type { VerifiedOrder } from "@/lib/dreamdex/types";
import { sanitizeEvidence, type ProofEvent, type ReceiptHeadline } from "@/lib/evidence/proof-event";

import type { ExpectedAccountOrigin, ReceiptVerdict } from "./receipt-model";

export const RECEIPT_EXPORT_SCHEMA = "sidecar.receipt-read.v1";

export interface ReceiptExportInput {
  order: VerifiedOrder;
  headline: ReceiptHeadline;
  verdict: ReceiptVerdict;
  expected: { account: Address; origin: ExpectedAccountOrigin } | null;
  counterpart: Address | null;
  captured: ProofEvent | null;
  exportedAt: string;
}

/**
 * The reconciled record as JSON: a fresh read of this receipt, not a recorded execution.
 * Bigints become decimal strings and anything secret-shaped is stripped.
 */
export function buildReceiptExport(input: ReceiptExportInput): string {
  const { order, headline, verdict, expected, counterpart, captured, exportedAt } = input;
  const { market, ...rest } = order;
  const record = {
    schema: RECEIPT_EXPORT_SCHEMA,
    kind: "fresh-read",
    exportedAt,
    network: { chainId: order.chainId, rpcUrl: NETWORK.rpcUrl, explorerUrl: NETWORK.explorerUrl },
    headline: { status: headline.status, headline: headline.headline, detail: headline.detail },
    verdict: {
      stamp: verdict.stamp,
      summary: verdict.summary,
      requiredPassed: verdict.requiredPassed,
      requiredTotal: verdict.requiredTotal,
      checks: verdict.rows.map((row) => ({ id: row.check.id, status: row.check.status, required: row.required, note: row.note })),
    },
    context: {
      expectedAccount: expected?.account ?? null,
      expectedAccountOrigin: expected?.origin ?? null,
      counterpartAccount: counterpart,
    },
    market: market
      ? { pool: market.pool, displaySymbol: market.displaySymbol, marginBank: market.marginBank, baseDecimals: market.baseDecimals, quoteDecimals: market.quoteDecimals }
      : null,
    order: rest,
    capturedInThisBrowser: captured,
  };
  return `${JSON.stringify(sanitizeEvidence(record).value, null, 2)}\n`;
}
