export const SITE_NAME = "Sidecar";

export const SITE_DESCRIPTION =
  "Sidecar compares one dreamDEX perp order in shared margin against a separate margin account on Somnia Hideki testnet, then checks the fill against the chain receipt.";

export const INDEXED_PATHS: readonly string[] = ["/", "/start", "/trade", "/receipt", "/proof"];

const LOCAL_ORIGIN = "http://localhost:3000";

export interface SiteUrlEnv {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

/**
 * An explicit site URL wins, then Vercel's production domain (which it sets without a scheme),
 * then localhost. Social cards need absolute URLs, so a value that does not parse is skipped
 * rather than failing the build.
 */
export function resolveSiteUrl(env: SiteUrlEnv): URL {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidates = [explicit, vercelHost ? `https://${vercelHost}` : undefined];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (URL.canParse(candidate)) return new URL(candidate);
  }
  return new URL(LOCAL_ORIGIN);
}

export const SITE_URL: URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});
