/** UI-level vocabularies shared by the primitives. Protocol types stay in lib/dreamdex/types. */

/** The primary (shared collateral) account is A; the separately funded account is B. */
export type AccountRole = "A" | "B";

/** Colour tone of a route-aware control. `neutral` is used before a route is chosen. */
export type RouteTone = "neutral" | "a" | "b";

export type StatusTone = "neutral" | "positive" | "warning" | "danger";

/** Presentation states for account health. Mapping protocol statuses onto these lives outside the UI kit. */
export type RiskState = "healthy" | "margin-call" | "liquidation-risk" | "unknown";

/** Mirrors TruthCheck["status"] so inspection rows can render truth checks directly. */
export type CheckStatus = "pass" | "fail" | "unknown";
