/** A real BTC-PERP fill on Hideki. Sidecar did not send it; the receipt page decodes it. */
import { PUBLIC_FILL_HASH } from "@/lib/evidence/public-fill";

export const DECODED_FILL_HASH = PUBLIC_FILL_HASH;
export const DECODED_FILL_HREF = `/receipt/${DECODED_FILL_HASH}`;
