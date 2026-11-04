/**
 * The receipt deadline the e2e dev server is compiled with. Short enough that the
 * outcome-unknown journey reaches UNKNOWN_OUTCOME quickly, long enough that the SUBMITTED
 * phase in front of it is on screen for assertions. No other journey waits for a receipt.
 */
export const E2E_RECEIPT_TIMEOUT_MS = 8_000;
