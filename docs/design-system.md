# Sidecar design system

Sidecar shows a trader two places to hold a new perp trade: sharing the collateral behind their current positions, or in a separate, separately funded account with its own margin. The interface has one job on top of that: make it obvious where every number came from and which account will sign.

This document covers the tokens in `app/globals.css`, the fonts in `app/fonts.ts`, the primitives in `components/ui/`, and the rules for using them. Every primitive is rendered in all its states, on both surfaces, at `/dev/styleguide` (development only, 404 in production builds).

## Principles

1. **Provenance on every figure.** A number is shown with its source: a chain read, an SDK calculation, indexed data, a Sidecar estimate, a scenario, or simulated sample data. The source is visible as a badge and as the line under the figure.
2. **Unavailable is a state, never a zero.** A value that could not be read renders as a hatched block with the reason. It never becomes `0`, a dash, an empty cell or "safe".
3. **Identity is never colour alone.** Account A and account B each have a hue, a letter, a badge shape, a label and a short address, and all of them travel together. Long and short carry an arrow and a word. Risk states carry an icon and a word.
4. **Two equal choices.** The shared and separate routes are presented with the same size, weight, depth and structure. Only the trader's selection changes them. Sidecar never preselects or visually favours the separate account because it looks safer.
5. **One clear action.** Each screen ends in a single primary action that names the account it acts on, for example "Place BTC trade in 0x9c3F7b…1A41".
6. **One marker.** The chartreuse marker is the only brand colour. It goes on the phrase a headline is about and on at most one call to action per view. It never marks a state, a figure or a route.
7. **Quiet motion.** Motion confirms something the trader did or a value that changed. Nothing loops for decoration, and everything stops under reduced motion.

## Look and feel

Sidecar reads like an evidence file on a desk: warm paper with a faint dotted grid, blue-black ink, large tight headlines, mono labels that count real steps, and product UI shown as cards lifted off the paper. Once per page the ink itself becomes the surface, a dark rounded band with mono metadata in its corners, for the moment the page exists for.

- **Paper.** Warm off-white canvas, `paper-grid` dots on a 20px pitch (five spacing steps), so content can sit on the grid.
- **Ink.** Blue-black, like a ballpoint, never a tinted near-black. The band is the same ink as a surface and uses the paper colour as its ink, so the two surfaces are one palette inverted.
- **Marker.** A highlighter stroke behind the key phrase of a headline (`<Accent>`), sitting on the lower part of the line and repeating on each wrapped line. Text on the marker is always `accent-ink`.
- **Headlines.** Pathway Extreme at its display optical size, slightly condensed, tracked to -0.05em and set at 0.92 leading. The face is used for headlines and the `xl` stat only.
- **Cards with presence.** Panels sit on a soft card shadow; floating cards lift further with a layered shadow and up to 2 degrees of tilt; a dashed connector line ties a composition together.
- **Inspection records.** Label left, dotted leader, value right, a verdict per row, and a mono footer that counts the verdicts.

## Surfaces

Sidecar has two surfaces that share one set of token names.

| Surface | Use | How |
|---|---|---|
| PAPER | Everything by default: trade screen, proof, receipts, landing | `<html data-surface="paper">` in the root layout, `paper-grid` on `<body>`. |
| BAND | The one dark section a page gets: a call to action, a live chain moment, the sign step if a surface wants it dark | `<Band>`, or `data-surface="band"` on a container. `FloatingCard tone="ink"` is a single dark card inside a light composition. |

A surface switch only changes the values behind the tokens, so a component written once works on both. Overlays (dialog, sheet) render in a portal and take a `surface` prop (`"paper"` default, or `"band"`).

Sidecar does not follow the operating system's light or dark preference: the surface is part of the meaning (record versus the one moment that matters). The `paper:` and `band:` variants style a subtree by surface; `paper:` does not match inside a band.

## Tokens

All tokens are semantic. Components use the Tailwind utilities generated from them (`bg-panel`, `text-ink-2`, `border-account-a-line`, `shadow-float`, `duration-base`, `z-modal`). Tailwind's default colour palette, type scale, radii, shadows, easings, tracking and leading presets are switched off, so a stray `text-zinc-500`, `text-3xl` or `rounded-3xl` does not compile to anything. Numeric utilities such as `z-50` or `duration-150` still compile, so reviews should catch them.

### Colour

| Token | PAPER | BAND | Role |
|---|---|---|---|
| `canvas` | #F2F1EC | #141A26 | Page background |
| `panel` | #FBFAF7 | #1B2230 | Panels and cards |
| `raised` | #FFFFFF | #232B3A | Controls, inputs, floating cards, dialogs |
| `sunken` | #F0EEE9 | #0F141E | Wells, segmented tracks, disabled inputs |
| `hover` | #EAE8E2 | #2A3343 | Hover fill for rows and ghost controls |
| `line` | #DDDAD3 | #2F3848 | Hairlines and dividers (decorative) |
| `line-strong` | #C3BFB6 | #465064 | Dashed and dotted frames, connectors (decorative) |
| `control` | #767C86 | #7D879A | Boundaries a person must see to use a control (inputs, segments, radios) |
| `ink` | #1B2232 | #F2F1EC | Primary text and figures |
| `ink-2` | #3D4656 | #C9CCD2 | Secondary text, labels |
| `ink-3` | #5A616E | #A0A6B0 | Tertiary text, hints, units, placeholders |
| `ink-4` | #8A8F98 | #6D7484 | Disabled glyphs and separators only, never for content |
| `key` / `key-hover` | #1B2232 / #2C3547 | #F2F1EC / #FFFFFF | Neutral primary button fill |
| `ink-inverse` | #FBFAF7 | #141A26 | Text on `key`, A, B and danger fills |
| `accent` / `accent-hover` | #D5F04E / #C9E63A | #D5F04E / #E1F76F | The marker: headline accent, the one accent button |
| `accent-line` | #74851A | #D5F04E | Border of the accent button |
| `accent-ink` | #1B2232 | #1B2232 | Text on the marker, on both surfaces |
| `account-a` | #175D9B | #7EB9EB | Account A (shared collateral) |
| `account-a-soft` / `-line` / `-hover` | #DCEAF8 / #4F84BA / #024C85 | #1A2D43 / #5288B4 / #95CAF8 | A's tint, border and button hover |
| `account-b` | #7E3A88 | #D4A1DC | Account B (separate margin) |
| `account-b-soft` / `-line` / `-hover` | #F2E4F4 / #9F69A7 / #6A2C73 | #33263F / #A074A7 / #E3B4EA | B's tint, border and button hover |
| `long` / `long-soft` | #1F6F3D / #DAEEDE | #79CD91 / #17311F | Long direction |
| `short` / `short-soft` | #AC312C / #FCE1DD | #ED8176 / #3F2227 | Short direction |
| `positive` / `-soft` | #1F6F3D / #DAEEDE | #79CD91 / #17311F | Healthy, filled, verified |
| `warning` / `-soft` | #8B5511 / #F6E6CB | #EDBB64 / #372C17 | Margin call, resting, stale, scenario |
| `danger` / `-soft` / `-hover` | #B02A2D / #FCE1DE / #971A20 | #F47B74 / #42212A / #FC928A | Liquidation risk, reverted, errors |
| `focus` | #1B2232 | #F2F1EC | Focus ring (the surface's ink, so it never collides with a meaning) |
| `hatch` | #CFCBC1 | #384256 | Stripe colour for unavailable and simulated marks |
| `scrim` | 42% ink | 72% near-black | Overlay behind dialogs and sheets |

Rules:

- The marker hue (chartreuse, around 118 degrees in OKLCH) sits apart from long and healthy green (around 150), warning amber (around 70), account A blue (around 245) and account B orchid (around 322), and it is far lighter than all of them, so it reads as a highlighter and not as a state.
- A and B hues mean "this account" and nothing else. They are never used for links, info, focus or success.
- Long shares green with healthy, and short shares red with liquidation risk. They are always paired with words, so context separates them.
- The marker is a fill, never a text colour. Body text never sits on it; only the accented phrase and the accent button label do.
- Text never sits directly on a hatch. Hatched areas put their words on a solid chip.

### Type

Three faces, each verified in a headless browser to have true tabular figures (all ten digits share one advance width with `tabular-nums`).

| Role | Face | Where |
|---|---|---|
| Display | Pathway Extreme, optical size axis 8 to 144 (`font-optical-sizing: auto`), width 88 to 92% (`type-hero`, `type-display`) | Headlines, the wordmark, the verified stamp, `Stat size="xl"` |
| UI | Atkinson Hyperlegible Next (`font-sans`) | Everything else. Chosen because 0 and O, and 1, l and I, stay distinct in balances and labels. |
| Mono | Atkinson Hyperlegible Mono (`font-mono`, `type-data`, `type-eyebrow`) | Eyebrows, addresses, hashes, block numbers, provenance tags, band corners |

Pathway Extreme was picked over other grotesques because its optical-size axis gives the hero a real display cut (tight joins, small counters) while the same family at 24px keeps open counters, and its slight condensing lets a 52px headline fit a 390px phone. Figures in tables and rows stay in the UI face.

The whole document uses `font-variant-numeric: tabular-nums`, so figures line up in every column.

| Token | Size / line | Use |
|---|---|---|
| `text-hero` | clamp 52 to 128 / 0.92 | One per page, with `type-hero` (tracking -0.05em) |
| `text-display-xl` | clamp 44 to 88 / 0.96 | Band headlines and major sections, with `type-hero` |
| `text-section` | clamp 36 to 64 / 1.0 | Section headlines, with `type-display` (tracking -0.035em) |
| `text-display-lg` | 48 / 50 | `Stat size="xl"` |
| `text-display` | 36 / 40 | Screen titles, receipt titles |
| `text-heading` | 24 / 30 | Dialog and sheet titles, mobile screen titles |
| `text-figure` | 21 / 26 | Stat values |
| `text-title` | 18 / 24 | Panel and card titles |
| `text-lead` | 16 / 24 | Ledes, prose on records and dialogs, large buttons |
| `text-body` | 14 / 22 | Default UI text |
| `text-small` | 13 / 20 | Dense rows, tables, key-value lists |
| `text-caption` | 12 / 18 | Labels, hints, units |
| `text-micro` | 11 / 16 | Eyebrows and provenance tags (mono, uppercase via CSS) |

Fluid steps use `rem + vw` so browser zoom still scales them. Tracking tokens: `tracking-hero` (-0.05em), `tracking-display` (-0.035em), `tracking-tight` (-0.015em, panel and card titles), `tracking-normal`, `tracking-label` (0.04em, tags), `tracking-eyebrow` (0.12em). Leading tokens: `leading-hero` 0.92, `leading-display` 0.98, `leading-tight` 1.1, `leading-snug` 1.3, `leading-normal` 1.5, `leading-relaxed` 1.65. `max-w-headline` (18ch) is available for a hero that should break early.

Uppercase is limited to eyebrows, provenance tags, feed strips, band corners, inspection headers and footers, and stamps. Everything else is sentence case.

### Space, radius, elevation

- Spacing uses Tailwind's 4px step (`--spacing: 0.25rem`): `p-4` is 16px. Sections on a page are 112px apart on phones and 144px from `md` up.
- Radius grows with the container: `rounded-xs` 4px for tags, badges and kbd; `rounded-sm` 8px for buttons, inputs and segments; `rounded-md` 12px for cards inside panels and unavailable blocks; `rounded-lg` 16px for panels, route cards and alerts; `rounded-xl` 22px for floating cards, dialogs, sheets and inspection records; `rounded-2xl` 32px for bands (22px below `md`). `rounded-full` is reserved for status pills (so a state never looks like a button) and account B's letter badge.

| Shadow | Use |
|---|---|
| `shadow-raised` | Controls on a card: secondary buttons, inputs, chips, kbd, the selected segment |
| `shadow-card` | Panels, unselected route cards, inspection records |
| `shadow-float` | Floating cards, the selected route card, tooltips |
| `shadow-button` | Primary, route and accent buttons |
| `shadow-overlay` | Dialogs and sheets |
| `shadow-sticky` | The sign bar |

- Containers: `max-w-measure` 40rem, `max-w-dialog` 30rem, `max-w-sheet` 34rem, `max-w-page` 90rem.
- Breakpoints: `sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem, `2xl` 96rem.

### Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120ms | Hover, press, segment change, copy feedback |
| `duration-base` | 200ms | Route selection, dialog in, fades |
| `duration-slow` | 320ms | Sheet in, identity band grow, stamp in |
| `duration-linger` | 960ms | Value-change highlight |
| `duration-loop` | 1600ms | Skeleton shimmer, loading sweep |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Everything that enters or changes |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Things leaving |

Animations: `animate-flash` (value changed), `animate-shimmer` (skeleton), `animate-sweep` (button busy), `animate-fade-in` / `animate-fade-out`, `animate-dialog-in`, `animate-sheet-in-right` / `animate-sheet-in-bottom`, `animate-stamp-in`. Floating cards and connectors are static: tilt is a pose, not an animation.

Under `prefers-reduced-motion: reduce` every animation and transition collapses to an instant change, the skeleton shimmer is removed and the loading sweep becomes a static bar.

### Layers

`z-raised` 10 (front floating card), `z-sticky` 20 (sign bar, sticky header), `z-overlay` 40 (scrim), `z-modal` 50 (dialog, sheet), `z-popover` 60 (tooltip), `z-toast` 70.

### Utilities

| Utility | What it does |
|---|---|
| `type-hero`, `type-display`, `type-eyebrow`, `type-data` | Text roles for hero headlines, display headlines, mono eyebrows and mono data |
| `marker` | The highlighter stroke (used by `<Accent>`) |
| `tabular` | Tabular lining figures (already the document default) |
| `hatch` | 135° stripes: "no value here" |
| `hatch-sim` | Denser 45° stripes: simulated data |
| `rule-indexed`, `rule-estimate`, `rule-simulated` | Provenance rules under a figure (dotted, dashed, hatched) |
| `outline-estimate` | Dashed outline around a group of estimated figures |
| `paper-grid` | Faint dotted grid in the current surface's dot colour (on `<body>` by default) |
| `viewfinder` | Corner brackets for panels that frame chain reads |
| `skeleton` | Shimmering placeholder fill |
| `focus-ring` | Visible ring on `:focus-visible` (all interactive elements also get one by default) |
| `paper:` / `band:` variants | Styles that apply only on one surface |

## Provenance system

The `Source` type in `lib/dreamdex/types.ts` drives one visual language. `ProvenanceBadge` takes a `Source` and renders the right style and label; `provenanceRuleClass(kind)` gives the matching rule under the figure.

| Kind | Badge | Rule under the figure | Meaning |
|---|---|---|---|
| `chain` | Solid border, strongest ink, `CHAIN · #38,357,692` | None | A contract read pinned to that block |
| `chain`, `sdk` with `pinned: false` | As above, `CHAIN · HEAD ~#38,357,692` | None | A head read whose method reports no block; the number is the head seen in the same batch, not a pin |
| `sdk` | Solid border, secondary ink, `SDK · #38,357,692` | None | An SDK calculation over chain state at that block |
| `indexer` | Dotted border, `INDEXED` (plus `· #block` when known) | Dotted | Indexed history; it can lag the chain and never drives risk figures |
| `estimate` | Dashed border, `EST` | Dashed | Sidecar arithmetic; the basis is in the accessible description |
| `scenario` | Dashed amber border, `SCENARIO` | Dashed | A hypothetical the trader asked for; never a protocol value |
| `simulated` | Hatched fill, `SIMULATED` | Hatched | Sample data for previews and tests; never live state |

Rules:

- Every badge has a full sentence for assistive tech, for example "Chain read at block 38,357,692 via getMarginAccount, 12:04:31 UTC." An unpinned read says "Chain read at the head (about block 38,357,692, not pinned) via getPerpVoucher, 12:04:31 UTC."
- When one source labels a whole group (a panel strip, a card), show one badge for the group and keep the rule on each figure: `KeyValueList badges={false}` and `Stat badge={false}` do exactly this.
- Unavailable values use `Unavailable` (or `Stat state="unavailable"`). The reason is required.
- Panels that frame chain reads use the `viewfinder` variant with a `PanelStrip` whose status word is always spelled out: `LIVE`, `STALE`, `DEGRADED` or `SIMULATED`, followed by network, block and age.
- Simulated data is never shown on a strip that says `LIVE`.

## Identity

| Thing | Encoding |
|---|---|
| Account A (shared collateral) | Blue hue, letter A in a rounded square (the main body), label, short address |
| Account B (separate margin) | Orchid hue, letter B in a circle (the docked compartment), label, short address |
| Long | Green, up-right arrow, the word "Long" |
| Short | Red, down-right arrow, the word "Short" |
| Healthy | Green, check in a circle, "Healthy" |
| Margin call | Amber, triangle, "Margin call" |
| Liquidation risk | Red, octagon, "Liquidation risk" |
| Unknown | Neutral, question mark, "Unknown" (never shown as healthy) |
| Truth checks | Check, cross or question mark plus "Pass", "Fail" or "Unknown" |

Short addresses keep six characters after `0x` and four at the end (`0x9c3F7b…1A41`), which is enough to compare against a wallet. The full address is one copy away.

The mark is a larger rounded body with a smaller compartment beside it, sitting lower and apart: same rider, separate margin. It is drawn on a 16-unit grid with every edge on a whole unit, so it stays crisp at 16px. In the site header and the browser icon (`app/icon.svg`) the compartment takes the marker fill with an ink outline: the separate margin is the part Sidecar adds. On dark browser tabs the body turns paper-coloured.

## Components

All primitives live in `components/ui/`, one file per family, with named exports and explicit prop types. They take preformatted strings or React nodes and contain no protocol logic or bigint arithmetic. Components that need state or event handlers are client components; the rest render on the server. Refs are passed as the `ref` prop (React 19).

### Page composition

| Component | Purpose and key props |
|---|---|
| `SiteHeader` | `current?: "trade" \| "proof"`, `meta?` (network facts, real reads only), `wallet?` (the wallet control), `sticky?`, `homeHref?` (default `/`). Mark with the marker compartment, links Trade and Proof (`aria-current="page"` on the open one), then meta and wallet. Below `md` meta and wallet take a second row so an address never truncates. |
| `SectionHeading`, `Accent` | `title` (wrap the key phrase in `<Accent>`), `index?` + `eyebrow?` (rendered as an `Eyebrow`), `lede?`, `as?` h1 / h2 / h3, `size?` hero / display / section, `align?` start / center, `id?` for `aria-labelledby`, `actions?` (right side on wide screens). `Accent` renders a `<mark class="marker">`. |
| `Band` | `corners?: { topStart, topEnd, bottomStart, bottomEnd }`, `padding?` md / lg, `grid?`, `as?` section / div / aside / footer, plus section attributes (`aria-label`, `id`). Sets `data-surface="band"`. Corner rows sit in the flow, so on a phone they stack above and below the content instead of covering it. |
| `FloatingCard` | `tilt?` -2 to 2 degrees, `depth?` front / back, `offset?` none / up / down, `tone?` paper / ink (ink renders on BAND tokens), `as?`, plus div attributes. |
| `Connector` | `orientation?` vertical / horizontal, `variant?` dashed / dotted, `start?` and `end?` none / dot / ring, `tone?` ink / accent, `className` for length (`h-24`, `w-full`). Decorative and `aria-hidden`. |
| `InspectionCard`, `tallyChecks`, `tallyLabel` | `title`, `items: KeyValueItem[]`, `meta?`, `leaders?` (default true), `badges?`, `footnote?`, `verdict?` (a `Stamp`), `headingAs?`. The footer tally ("8 / 10 passed · 1 failed · 1 unknown") is computed from the rows, so it cannot disagree with them. |

### Primitives

| Component | Purpose and key props |
|---|---|
| `Button` | `variant` primary, accent, secondary, ghost, danger; `size` sm, md, lg; `tone` neutral, a, b for route actions (accent ignores tone); `loading` + `loadingLabel` (busy, blocks repeat clicks, keeps its tone); `disabledReason` (blocks the action, stays focusable, shows the reason and announces it as the description); `leading`, `trailing`, `block`, `asChild`. `buttonClassName()` styles links. |
| `IconButton` | Square icon control with a required `label` (accessible name), optional `tooltip`. 40px on touch screens. |
| `StatusPill` | `tone` neutral, positive, warning, danger; dot or `icon`; `appearance` soft or outline. States only, never actions. |
| `RiskPill` | `state` healthy, margin-call, liquidation-risk, unknown, as hue + icon + word. Mapping protocol statuses onto these states happens outside the kit. |
| `SideTag` | `side` long or short, as hue + arrow + word. |
| `ProvenanceBadge` | `source: Source`. Also exports `provenanceLabel`, `provenanceDescription`, `provenanceRuleClass`, `groupDigits`. |
| `Stat` | `state` known (`value`, `unit`, `source`, `emphasis`), unavailable (`reason`), or loading. `size` sm, md, lg, xl (xl sets the figure in the display face); `note`, `badge`. Values flash briefly when they change. |
| `ValueFlash` | The highlight on its own, for figures outside `Stat` (table cells). |
| `Unavailable` | Hatched block with a required `reason`; `variant` block or inline. |
| `Skeleton`, `SkeletonText` | Placeholders sized with spacing utilities to match the final layout. |
| `AccountBadge`, `AccountLetter`, `shortenAddress` | Letter + label + short address + copy button with visible and announced feedback. `AccountLetter appearance="on-fill"` for use inside an A or B button. |
| `Panel`, `PanelStrip` | Container with `eyebrow`, `title`, `actions`, `strip`; `variant` default or viewfinder. `PanelStrip` takes `status`, uppercase `items` and an `age` that keeps its own case (`2s`, not `2S`). |
| `Eyebrow` | Mono label; `index` adds a step number in ink. Use numbers only for the real order of a flow (positions, new trade, where it lives, sign). |
| `KeyValueList`, `CheckMark` | Inspection rows (`<dl>`), with `source`, `check`, `hint`; `leaders` for dotted leaders; `density`; `badges`. |
| `SegmentedControl` | Single choice as a radio group with arrow-key navigation; per-option `tone` (long, short, a, b). 42px tall at `md`, 40px on touch screens at every size. |
| `TextField`, `NumberField` | 40px tall (`md`) or 48px (`lg`). Label above, hint and error below (both linked by `aria-describedby`), `suffix`, `prefix`, `labelAction`. `NumberField` is a text input with a decimal keypad and never parses the value, so nothing is lost before it reaches bigint code. |
| `Slider` | Scenario input with `valueText` (also the screen-reader value), optional `origin` so a +/- move fills from zero, `badge` slot for SCENARIO. |
| `ChoiceCardGroup`, `ChoiceCard` | Rich radio cards for route selection: a native radio labelled by the card title, the whole card clickable, arrow keys between cards, identity band per `tone`. Selection lifts the card to `shadow-float`. |
| `Dialog`, `DialogContent`, `DialogTrigger`, `DialogClose` | Modal with `title` (display face), `description`, `actions`, `surface` paper or band. Focus moves in, is trapped, and returns to the trigger. |
| `Sheet`, `SheetContent`, `SheetTrigger` | Bottom sheet on small screens, right panel from `md`. Used for "See exact calculations". |
| `Tooltip` | Supplementary text on a focusable trigger. Never the only place for information a person needs to act. |
| `Stamp` | `status` verified, not-verified, pending. Only verified gets the rotated double-ruled stamp; the others are flat tags. |
| `InlineAlert` | `tone`, `title`, body, one `action`; `announce` assertive or polite for messages that appear after an action. |
| `EmptyState` | A plain statement of what is missing and the next step, with a hatched icon tile (hatch means "nothing here"). |
| `Divider` | solid, dashed or double (the ledger rule on records), optional label, vertical. |
| `Kbd` | Keyboard key. |
| `SidecarMark`, `SidecarGlyph` | Glyph and wordmark; `accent` fills the compartment with the marker. |
| `cx` | `clsx` wrapper. There is no class conflict resolution, so a `className` passed to a primitive should add layout rather than restyle it. |

### Usage rules

- The primary action names the account it signs from. Do not use generic labels like "Trade now".
- `Button variant="accent"` appears at most once per view, for the step the page exists for (for example "Open the trade screen" on a landing band). Signing buttons keep their A or B tone, so the account is never hidden behind the brand colour.
- `<Accent>` appears at most once per headline and never on a number, an account or a route name.
- A blocked action uses `disabledReason`, not a silent `disabled`. The reason states the cause and the fix ("Wallet mismatch: switch to 0x5Ae3c0…e2D4 before signing.").
- The two route cards always render together, with the same rows in the same order, the same depth and mirrored tilt in any composition. The grounded fact "Shares collateral with your ETH-PERP position: Yes / No" sits at the top of each.
- Floating cards are illustration. Every figure inside still carries its provenance badge; sample figures carry SIMULATED, and a composition built from samples says so in its caption.
- Band corners carry real readings only: the chain id, a live block with its age, "Paper funds only". No invented coordinates, counts or times.
- Projected figures (maintenance after the trade, free collateral after) carry EST until signed and confirmed.
- The scenario slider and every figure it drives carry SCENARIO.
- A receipt shows the verified stamp only when every truth check passed. A record waiting on the chain shows the pending tag; a record that failed a check shows not verified.
- Tables of positions collapse to stacked rows below `sm`.

## Copy

- Sentence case, plain verbs, no filler. Labels say what a thing is ("Free collateral"), buttons say what happens ("Place BTC trade in 0x9c3F7b…1A41").
- No em dashes in UI copy or docs.
- Errors say what happened and what to do next, without apologising.
- Never claim more than the chain proves. Sidecar does not say a trade is protected, guaranteed or safe, and does not say a separate account prevents liquidation. Separate accounts limit shared collateral exposure and use capital less efficiently; liquidation is still possible in either account.

## Accessibility

- Contrast: every text token meets WCAG 2.x AA (4.5:1) on every surface it is used on, and every boundary a person needs to see (`control`, `focus`, account lines, the accent button border) meets 3:1. The full table is below.
- Focus: every interactive element shows a 2px ring in the surface's ink colour, offset by 2px, on `:focus-visible`. Radio cards and inputs show the ring around the whole control.
- Touch: interactive controls are at least 40px tall on coarse pointers (`pointer-coarse:` sizing on small buttons, icon buttons, segments, copy buttons, header links and inline link actions). Text and number fields are 40px tall everywhere. The slider's 40px-tall root is its touch area, and the thumb grows to 28px on touch.
- Keyboard: segmented controls and route cards are radio groups (arrow keys move and select); dialogs and sheets trap focus, close on Escape and return focus to their trigger.
- Semantics: inspection rows are `<dl>`, stats are `<dl>`, the route choice is a `<fieldset>` with a `<legend>`, step eyebrows are text (uppercase is CSS only), the headline accent is a `<mark>`, the site nav is a labelled `<nav>` with `aria-current`, decorative glyphs and connectors are `aria-hidden`.
- Announcements: copy feedback and disabled reasons are announced; inline alerts can announce politely or assertively when they appear after an action.
- Colour is never the only carrier: see Identity.

### Contrast table

Ratios are computed from the hex values shipped in `app/globals.css` (WCAG 2.x relative luminance) by reading the two surface blocks directly, so the table matches the code. Decorative hairlines (`line`, `line-strong`) and connectors are not component boundaries and are not listed. Text never sits directly on `hatch` except `ink` and `ink-2`, which are listed. The marker is listed only with `accent-ink`, the one colour allowed on it.

#### PAPER

| Foreground | On | Ratio | Result |
|---|---|---:|---|
| `ink` #1B2232 | `canvas` #F2F1EC | 14.05 | AA text |
| `ink` #1B2232 | `panel` #FBFAF7 | 15.22 | AA text |
| `ink` #1B2232 | `raised` #FFFFFF | 15.89 | AA text |
| `ink` #1B2232 | `sunken` #F0EEE9 | 13.71 | AA text |
| `ink` #1B2232 | `hover` #EAE8E2 | 12.97 | AA text |
| `ink` #1B2232 | `hatch` #CFCBC1 | 9.81 | AA text |
| `ink` #1B2232 | `account-a-soft` #DCEAF8 | 12.99 | AA text |
| `ink` #1B2232 | `account-b-soft` #F2E4F4 | 13.00 | AA text |
| `ink` #1B2232 | `positive-soft` #DAEEDE | 13.07 | AA text |
| `ink` #1B2232 | `warning-soft` #F6E6CB | 12.94 | AA text |
| `ink` #1B2232 | `danger-soft` #FCE1DE | 12.84 | AA text |
| `ink-2` #3D4656 | `canvas` #F2F1EC | 8.41 | AA text |
| `ink-2` #3D4656 | `panel` #FBFAF7 | 9.11 | AA text |
| `ink-2` #3D4656 | `raised` #FFFFFF | 9.51 | AA text |
| `ink-2` #3D4656 | `sunken` #F0EEE9 | 8.20 | AA text |
| `ink-2` #3D4656 | `hover` #EAE8E2 | 7.76 | AA text |
| `ink-2` #3D4656 | `hatch` #CFCBC1 | 5.87 | AA text |
| `ink-2` #3D4656 | `account-a-soft` #DCEAF8 | 7.77 | AA text |
| `ink-2` #3D4656 | `account-b-soft` #F2E4F4 | 7.78 | AA text |
| `ink-2` #3D4656 | `positive-soft` #DAEEDE | 7.82 | AA text |
| `ink-2` #3D4656 | `warning-soft` #F6E6CB | 7.74 | AA text |
| `ink-2` #3D4656 | `danger-soft` #FCE1DE | 7.68 | AA text |
| `ink-3` #5A616E | `canvas` #F2F1EC | 5.51 | AA text |
| `ink-3` #5A616E | `panel` #FBFAF7 | 5.97 | AA text |
| `ink-3` #5A616E | `raised` #FFFFFF | 6.23 | AA text |
| `ink-3` #5A616E | `sunken` #F0EEE9 | 5.37 | AA text |
| `ink-3` #5A616E | `hover` #EAE8E2 | 5.09 | AA text |
| `ink-3` #5A616E | `account-a-soft` #DCEAF8 | 5.09 | AA text |
| `ink-3` #5A616E | `account-b-soft` #F2E4F4 | 5.10 | AA text |
| `ink-3` #5A616E | `warning-soft` #F6E6CB | 5.07 | AA text |
| `account-a` #175D9B | `canvas` #F2F1EC | 6.04 | AA text |
| `account-a` #175D9B | `panel` #FBFAF7 | 6.54 | AA text |
| `account-a` #175D9B | `raised` #FFFFFF | 6.83 | AA text |
| `account-a` #175D9B | `account-a-soft` #DCEAF8 | 5.58 | AA text |
| `account-b` #7E3A88 | `canvas` #F2F1EC | 6.52 | AA text |
| `account-b` #7E3A88 | `panel` #FBFAF7 | 7.06 | AA text |
| `account-b` #7E3A88 | `raised` #FFFFFF | 7.37 | AA text |
| `account-b` #7E3A88 | `account-b-soft` #F2E4F4 | 6.03 | AA text |
| `long` #1F6F3D | `canvas` #F2F1EC | 5.46 | AA text |
| `long` #1F6F3D | `panel` #FBFAF7 | 5.92 | AA text |
| `long` #1F6F3D | `raised` #FFFFFF | 6.18 | AA text |
| `long` #1F6F3D | `long-soft` #DAEEDE | 5.08 | AA text |
| `short` #AC312C | `canvas` #F2F1EC | 5.75 | AA text |
| `short` #AC312C | `panel` #FBFAF7 | 6.23 | AA text |
| `short` #AC312C | `raised` #FFFFFF | 6.50 | AA text |
| `short` #AC312C | `short-soft` #FCE1DD | 5.25 | AA text |
| `positive` #1F6F3D | `canvas` #F2F1EC | 5.46 | AA text |
| `positive` #1F6F3D | `panel` #FBFAF7 | 5.92 | AA text |
| `positive` #1F6F3D | `raised` #FFFFFF | 6.18 | AA text |
| `positive` #1F6F3D | `positive-soft` #DAEEDE | 5.08 | AA text |
| `warning` #8B5511 | `canvas` #F2F1EC | 5.45 | AA text |
| `warning` #8B5511 | `panel` #FBFAF7 | 5.91 | AA text |
| `warning` #8B5511 | `raised` #FFFFFF | 6.17 | AA text |
| `warning` #8B5511 | `warning-soft` #F6E6CB | 5.02 | AA text |
| `danger` #B02A2D | `canvas` #F2F1EC | 5.78 | AA text |
| `danger` #B02A2D | `panel` #FBFAF7 | 6.26 | AA text |
| `danger` #B02A2D | `raised` #FFFFFF | 6.53 | AA text |
| `danger` #B02A2D | `danger-soft` #FCE1DE | 5.28 | AA text |
| `ink-inverse` #FBFAF7 | `key` #1B2232 | 15.22 | AA text |
| `ink-inverse` #FBFAF7 | `key-hover` #2C3547 | 11.78 | AA text |
| `ink-inverse` #FBFAF7 | `account-a` #175D9B | 6.54 | AA text |
| `ink-inverse` #FBFAF7 | `account-a-hover` #024C85 | 8.47 | AA text |
| `ink-inverse` #FBFAF7 | `account-b` #7E3A88 | 7.06 | AA text |
| `ink-inverse` #FBFAF7 | `account-b-hover` #6A2C73 | 9.06 | AA text |
| `ink-inverse` #FBFAF7 | `danger` #B02A2D | 6.26 | AA text |
| `ink-inverse` #FBFAF7 | `danger-hover` #971A20 | 8.10 | AA text |
| `accent-ink` #1B2232 | `accent` #D5F04E | 12.41 | AA text |
| `accent-ink` #1B2232 | `accent-hover` #C9E63A | 11.25 | AA text |
| `control` #767C86 | `canvas` #F2F1EC | 3.72 | AA non-text (3:1) |
| `control` #767C86 | `panel` #FBFAF7 | 4.03 | AA non-text (3:1) |
| `control` #767C86 | `raised` #FFFFFF | 4.20 | AA non-text (3:1) |
| `control` #767C86 | `sunken` #F0EEE9 | 3.62 | AA non-text (3:1) |
| `focus` #1B2232 | `canvas` #F2F1EC | 14.05 | AA non-text (3:1) |
| `focus` #1B2232 | `panel` #FBFAF7 | 15.22 | AA non-text (3:1) |
| `focus` #1B2232 | `raised` #FFFFFF | 15.89 | AA non-text (3:1) |
| `focus` #1B2232 | `sunken` #F0EEE9 | 13.71 | AA non-text (3:1) |
| `account-a-line` #4F84BA | `panel` #FBFAF7 | 3.77 | AA non-text (3:1) |
| `account-a-line` #4F84BA | `raised` #FFFFFF | 3.93 | AA non-text (3:1) |
| `account-b-line` #9F69A7 | `panel` #FBFAF7 | 3.98 | AA non-text (3:1) |
| `account-b-line` #9F69A7 | `raised` #FFFFFF | 4.16 | AA non-text (3:1) |
| `accent-line` #74851A | `canvas` #F2F1EC | 3.63 | AA non-text (3:1) |
| `accent-line` #74851A | `panel` #FBFAF7 | 3.94 | AA non-text (3:1) |
| `accent-line` #74851A | `raised` #FFFFFF | 4.11 | AA non-text (3:1) |

#### BAND

| Foreground | On | Ratio | Result |
|---|---|---:|---|
| `ink` #F2F1EC | `canvas` #141A26 | 15.40 | AA text |
| `ink` #F2F1EC | `panel` #1B2230 | 14.09 | AA text |
| `ink` #F2F1EC | `raised` #232B3A | 12.56 | AA text |
| `ink` #F2F1EC | `sunken` #0F141E | 16.30 | AA text |
| `ink` #F2F1EC | `hover` #2A3343 | 11.23 | AA text |
| `ink` #F2F1EC | `hatch` #384256 | 8.92 | AA text |
| `ink` #F2F1EC | `account-a-soft` #1A2D43 | 12.38 | AA text |
| `ink` #F2F1EC | `account-b-soft` #33263F | 12.46 | AA text |
| `ink` #F2F1EC | `positive-soft` #17311F | 12.42 | AA text |
| `ink` #F2F1EC | `warning-soft` #372C17 | 12.10 | AA text |
| `ink` #F2F1EC | `danger-soft` #42212A | 12.52 | AA text |
| `ink-2` #C9CCD2 | `canvas` #141A26 | 10.83 | AA text |
| `ink-2` #C9CCD2 | `panel` #1B2230 | 9.90 | AA text |
| `ink-2` #C9CCD2 | `raised` #232B3A | 8.83 | AA text |
| `ink-2` #C9CCD2 | `sunken` #0F141E | 11.46 | AA text |
| `ink-2` #C9CCD2 | `hover` #2A3343 | 7.90 | AA text |
| `ink-2` #C9CCD2 | `hatch` #384256 | 6.27 | AA text |
| `ink-2` #C9CCD2 | `account-a-soft` #1A2D43 | 8.70 | AA text |
| `ink-2` #C9CCD2 | `account-b-soft` #33263F | 8.76 | AA text |
| `ink-2` #C9CCD2 | `positive-soft` #17311F | 8.73 | AA text |
| `ink-2` #C9CCD2 | `warning-soft` #372C17 | 8.50 | AA text |
| `ink-2` #C9CCD2 | `danger-soft` #42212A | 8.80 | AA text |
| `ink-3` #A0A6B0 | `canvas` #141A26 | 7.11 | AA text |
| `ink-3` #A0A6B0 | `panel` #1B2230 | 6.51 | AA text |
| `ink-3` #A0A6B0 | `raised` #232B3A | 5.80 | AA text |
| `ink-3` #A0A6B0 | `sunken` #0F141E | 7.53 | AA text |
| `ink-3` #A0A6B0 | `hover` #2A3343 | 5.19 | AA text |
| `ink-3` #A0A6B0 | `account-a-soft` #1A2D43 | 5.72 | AA text |
| `ink-3` #A0A6B0 | `account-b-soft` #33263F | 5.76 | AA text |
| `ink-3` #A0A6B0 | `warning-soft` #372C17 | 5.59 | AA text |
| `account-a` #7EB9EB | `canvas` #141A26 | 8.32 | AA text |
| `account-a` #7EB9EB | `panel` #1B2230 | 7.61 | AA text |
| `account-a` #7EB9EB | `raised` #232B3A | 6.78 | AA text |
| `account-a` #7EB9EB | `account-a-soft` #1A2D43 | 6.68 | AA text |
| `account-b` #D4A1DC | `canvas` #141A26 | 8.24 | AA text |
| `account-b` #D4A1DC | `panel` #1B2230 | 7.53 | AA text |
| `account-b` #D4A1DC | `raised` #232B3A | 6.72 | AA text |
| `account-b` #D4A1DC | `account-b-soft` #33263F | 6.67 | AA text |
| `long` #79CD91 | `canvas` #141A26 | 9.09 | AA text |
| `long` #79CD91 | `panel` #1B2230 | 8.31 | AA text |
| `long` #79CD91 | `raised` #232B3A | 7.41 | AA text |
| `long` #79CD91 | `long-soft` #17311F | 7.32 | AA text |
| `short` #ED8176 | `canvas` #141A26 | 6.64 | AA text |
| `short` #ED8176 | `panel` #1B2230 | 6.07 | AA text |
| `short` #ED8176 | `raised` #232B3A | 5.41 | AA text |
| `short` #ED8176 | `short-soft` #3F2227 | 5.45 | AA text |
| `positive` #79CD91 | `canvas` #141A26 | 9.09 | AA text |
| `positive` #79CD91 | `panel` #1B2230 | 8.31 | AA text |
| `positive` #79CD91 | `raised` #232B3A | 7.41 | AA text |
| `positive` #79CD91 | `positive-soft` #17311F | 7.32 | AA text |
| `warning` #EDBB64 | `canvas` #141A26 | 9.87 | AA text |
| `warning` #EDBB64 | `panel` #1B2230 | 9.02 | AA text |
| `warning` #EDBB64 | `raised` #232B3A | 8.05 | AA text |
| `warning` #EDBB64 | `warning-soft` #372C17 | 7.75 | AA text |
| `danger` #F47B74 | `canvas` #141A26 | 6.58 | AA text |
| `danger` #F47B74 | `panel` #1B2230 | 6.02 | AA text |
| `danger` #F47B74 | `raised` #232B3A | 5.37 | AA text |
| `danger` #F47B74 | `danger-soft` #42212A | 5.35 | AA text |
| `ink-inverse` #141A26 | `key` #F2F1EC | 15.40 | AA text |
| `ink-inverse` #141A26 | `key-hover` #FFFFFF | 17.42 | AA text |
| `ink-inverse` #141A26 | `account-a` #7EB9EB | 8.32 | AA text |
| `ink-inverse` #141A26 | `account-a-hover` #95CAF8 | 10.02 | AA text |
| `ink-inverse` #141A26 | `account-b` #D4A1DC | 8.24 | AA text |
| `ink-inverse` #141A26 | `account-b-hover` #E3B4EA | 9.94 | AA text |
| `ink-inverse` #141A26 | `danger` #F47B74 | 6.58 | AA text |
| `ink-inverse` #141A26 | `danger-hover` #FC928A | 7.98 | AA text |
| `accent-ink` #1B2232 | `accent` #D5F04E | 12.41 | AA text |
| `accent-ink` #1B2232 | `accent-hover` #E1F76F | 13.42 | AA text |
| `control` #7D879A | `canvas` #141A26 | 4.81 | AA non-text (3:1) |
| `control` #7D879A | `panel` #1B2230 | 4.40 | AA non-text (3:1) |
| `control` #7D879A | `raised` #232B3A | 3.93 | AA non-text (3:1) |
| `control` #7D879A | `sunken` #0F141E | 5.10 | AA non-text (3:1) |
| `focus` #F2F1EC | `canvas` #141A26 | 15.40 | AA non-text (3:1) |
| `focus` #F2F1EC | `panel` #1B2230 | 14.09 | AA non-text (3:1) |
| `focus` #F2F1EC | `raised` #232B3A | 12.56 | AA non-text (3:1) |
| `focus` #F2F1EC | `sunken` #0F141E | 16.30 | AA non-text (3:1) |
| `account-a-line` #5288B4 | `panel` #1B2230 | 4.20 | AA non-text (3:1) |
| `account-a-line` #5288B4 | `raised` #232B3A | 3.75 | AA non-text (3:1) |
| `account-b-line` #A074A7 | `panel` #1B2230 | 4.21 | AA non-text (3:1) |
| `account-b-line` #A074A7 | `raised` #232B3A | 3.76 | AA non-text (3:1) |
| `accent-line` #D5F04E | `canvas` #141A26 | 13.61 | AA non-text (3:1) |
| `accent-line` #D5F04E | `panel` #1B2230 | 12.44 | AA non-text (3:1) |
| `accent-line` #D5F04E | `raised` #232B3A | 11.10 | AA non-text (3:1) |

## Screen layouts

**Site frame.** `SiteHeader` at the top of every page on the paper canvas, `max-w-page` content with 16px gutters on phones and 32px from `md`.

**Trade screen.** Paper surface. Header with the mark, Trade and Proof, the network line ("Somnia Hideki Testnet · 50383", live block and its age), a subdued "Paper funds only" pill and the wallet control. From `xl` up the content splits 45 / 55: positions (01) and the order ticket (02) on the left, "Where should this trade live?" (03) as a section headline with the two equal route cards on the right. Below `xl` the sections stack. A sticky sign bar (04) holds the wallet check, "See exact calculations" and the primary action. Below `md` the order is positions, ticket, comparison, then the sign bar, with the network and the connected address kept on screen.

**Receipt and proof.** Paper surface. An eyebrow, a display-face title, the transaction hash and network, a double ledger rule, then an `InspectionCard` with a verdict per check, the computed tally, the read block and the stamp or tag.

**Landing.** Paper surface. A hero `SectionHeading` with one `Accent`, a floating-card composition of the product (one order card, a dashed `Connector`, two mirrored route cards, every figure badged), numbered sections only where the content is the real four-step flow, and one `Band` near the end with real chain facts in its corners and the single accent button.
