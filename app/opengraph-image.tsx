import { ImageResponse } from "next/og";

export const alt = "Sidecar: put the trade next to your positions, or give it its own margin.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Mirrors the paper tokens in app/globals.css. ImageResponse cannot read CSS variables.
const CANVAS = "#f2f1ec";
const INK = "#1b2232";
const INK_3 = "#5a616e";
const GRID_DOT = "#d0ccc2";
const ACCENT = "#d5f04e";

// The marker sits on the lower part of the line, like the <Accent> stroke on the site.
const MARKER = `linear-gradient(to bottom, transparent 42%, ${ACCENT} 42%, ${ACCENT} 94%, transparent 94%)`;

/**
 * Uses the bundled default face: the site's fonts ship only as woff2, which ImageResponse cannot
 * read, and fetching a font at build time would make the build depend on the network.
 */
export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        backgroundColor: CANVAS,
        backgroundImage: `radial-gradient(circle, ${GRID_DOT} 1.5px, transparent 1.5px)`,
        backgroundSize: "20px 20px",
        color: INK,
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: "-0.02em" }}>Sidecar</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 78,
          lineHeight: 1.04,
          letterSpacing: "-0.045em",
        }}
      >
        <div style={{ display: "flex" }}>Put the trade next to your</div>
        <div style={{ display: "flex" }}>positions, or give it</div>
        <div style={{ display: "flex" }}>
          <span style={{ backgroundImage: MARKER, paddingLeft: 10, marginLeft: -10 }}>its own margin</span>
          <span>.</span>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: INK_3, letterSpacing: "0.02em" }}>
        dreamDEX perps · Somnia Hideki testnet
      </div>
    </div>,
    size,
  );
}
