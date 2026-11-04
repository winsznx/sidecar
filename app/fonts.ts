import localFont from "next/font/local";

/**
 * Three faces, each with verified tabular figures (all ten digits share one advance under tnum):
 * - display: Pathway Extreme. Its optical-size axis runs to 144, so the hero gets a true display
 *   cut with tight joins while 24px headings keep open counters; the width axis is set slightly
 *   condensed so very large lines still fit a phone.
 * - ui: Atkinson Hyperlegible Next, chosen because 0/O and 1/l/I stay distinct in balances.
 * - mono: Atkinson Hyperlegible Mono for eyebrows, addresses, hashes and block numbers.
 *
 * Self-hosted from the Fontsource packages (OFL-1.1) so a build never depends on reaching a font CDN.
 * The CSS variables are consumed by app/globals.css (--font-display / --font-sans / --font-mono).
 */
export const displayFace = localFont({
  src: "../node_modules/@fontsource-variable/pathway-extreme/files/pathway-extreme-latin-standard-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-display-face",
  declarations: [{ prop: "font-stretch", value: "75% 100%" }],
});

// Next has no fallback metrics for these local faces, so the fallback stack is named explicitly.
export const uiFace = localFont({
  src: "../node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-ui-face",
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const monoFace = localFont({
  src: "../node_modules/@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-mono-face",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const fontVariables: string = [displayFace.variable, uiFace.variable, monoFace.variable].join(" ");
