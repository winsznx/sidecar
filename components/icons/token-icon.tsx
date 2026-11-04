import TokenADA from "@web3icons/react/icons/tokens/TokenADA";
import TokenAVAX from "@web3icons/react/icons/tokens/TokenAVAX";
import TokenBNB from "@web3icons/react/icons/tokens/TokenBNB";
import TokenBTC from "@web3icons/react/icons/tokens/TokenBTC";
import TokenDOGE from "@web3icons/react/icons/tokens/TokenDOGE";
import TokenETH from "@web3icons/react/icons/tokens/TokenETH";
import TokenHYPE from "@web3icons/react/icons/tokens/TokenHYPE";
import TokenLINK from "@web3icons/react/icons/tokens/TokenLINK";
import TokenLIT from "@web3icons/react/icons/tokens/TokenLIT";
import TokenNEAR from "@web3icons/react/icons/tokens/TokenNEAR";
import TokenPEPE from "@web3icons/react/icons/tokens/TokenPEPE";
import TokenSOL from "@web3icons/react/icons/tokens/TokenSOL";
import TokenSUI from "@web3icons/react/icons/tokens/TokenSUI";
import TokenTAO from "@web3icons/react/icons/tokens/TokenTAO";
import TokenXLM from "@web3icons/react/icons/tokens/TokenXLM";
import TokenXRP from "@web3icons/react/icons/tokens/TokenXRP";
import TokenZEC from "@web3icons/react/icons/tokens/TokenZEC";
import { clsx } from "clsx";
import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

import pumpLogo from "./assets/pump.png";
import somiLogo from "./assets/somi.png";
import usdsoLogo from "./assets/usdso.png";
import vvvLogo from "./assets/vvv.png";
import wldLogo from "./assets/wld.png";
import zroLogo from "./assets/zro.png";

/*
 * Per-file imports rather than the package barrel: the barrel re-exports ~7,400
 * icons, and dev builds and tests would load all of them even though production
 * tree-shakes.
 */
type PackageIcon = typeof TokenBTC;

const PACKAGE_ICONS: Readonly<Record<string, PackageIcon>> = {
  ADA: TokenADA,
  AVAX: TokenAVAX,
  BNB: TokenBNB,
  BTC: TokenBTC,
  DOGE: TokenDOGE,
  ETH: TokenETH,
  HYPE: TokenHYPE,
  LINK: TokenLINK,
  LIT: TokenLIT,
  NEAR: TokenNEAR,
  PEPE: TokenPEPE,
  SOL: TokenSOL,
  SUI: TokenSUI,
  TAO: TokenTAO,
  XLM: TokenXLM,
  XRP: TokenXRP,
  ZEC: TokenZEC,
};

// Logos the icon package lacks, stored in the repo at 64px so nothing is fetched from a third party at runtime.
const IMAGE_ICONS: Readonly<Record<string, StaticImageData>> = {
  PUMP: pumpLogo,
  SOMI: somiLogo,
  // STT is Somnia's native gas token and carries the network's mark.
  STT: somiLogo,
  USDSO: usdsoLogo,
  VVV: vvvLogo,
  WLD: wldLogo,
  ZRO: zroLogo,
};

const DEFAULT_SIZE = 20;

const PERP_SUFFIX = /[-_/]PERP$/;

// Perp venues list sub-cent tokens per 1000 units ("1000PEPE"); the logo is the underlying token's.
const UNIT_MULTIPLIER_PREFIX = /^10{3,}(?=[A-Z])/;

/** "btc-perp" -> "BTC", "1000PEPE" -> "PEPE", "USDso" -> "USDSO". */
export function normalizeTokenSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(PERP_SUFFIX, "").replace(UNIT_MULTIPLIER_PREFIX, "");
}

/** True when `symbol` has a bundled logo; false means `TokenIcon` draws the letter fallback. */
export function hasTokenIcon(symbol: string): boolean {
  const key = normalizeTokenSymbol(symbol);
  return key in IMAGE_ICONS || key in PACKAGE_ICONS;
}

export interface TokenIconProps {
  /** Base symbol as the SDK reports it ("BTC") or the display form ("BTC-PERP"). */
  symbol: string;
  /** Pixel size of the square. */
  size?: number;
  className?: string;
  /** Accessible name. Leave unset when a visible symbol label sits next to the icon. */
  title?: string;
}

interface A11yProps {
  role?: "img";
  "aria-label"?: string;
  "aria-hidden"?: true;
}

function a11yProps(title: string | undefined): A11yProps {
  return title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
}

export function TokenIcon({ symbol, size = DEFAULT_SIZE, className, title }: TokenIconProps): ReactNode {
  const key = normalizeTokenSymbol(symbol);

  const image = IMAGE_ICONS[key];
  if (image) return <ImageMark image={image} tokenKey={key} size={size} className={className} title={title} />;

  const Icon = PACKAGE_ICONS[key];
  if (Icon) {
    return (
      <Icon
        variant="background"
        size={size}
        focusable="false"
        data-token-icon={key}
        className={clsx("shrink-0 overflow-hidden rounded-full ring-1 ring-line", className)}
        {...a11yProps(title)}
      />
    );
  }

  return <LetterMark letters={fallbackLetters(key, symbol)} size={size} className={className} title={title} />;
}

export type SupportedNetwork = "somnia";

export interface NetworkIconProps {
  network?: SupportedNetwork;
  size?: number;
  className?: string;
  title?: string;
}

export function NetworkIcon({ size = DEFAULT_SIZE, className, title }: NetworkIconProps): ReactNode {
  return <ImageMark image={somiLogo} tokenKey="SOMNIA" size={size} className={className} title={title} />;
}

function fallbackLetters(key: string, original: string): string {
  // Unlisted pools surface as a shortened address; its first letters would read as a ticker.
  if (key.startsWith("0X")) return "?";
  const letters = key.replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return letters || original.trim().slice(0, 1).toUpperCase() || "?";
}

interface MarkProps {
  size: number;
  className: string | undefined;
  title: string | undefined;
}

function LetterMark({ letters, size, className, title }: MarkProps & { letters: string }): ReactNode {
  // Three letters need a smaller face to stay inside the circle at 16px.
  const fontSize = Math.round(size * (letters.length > 2 ? 0.3 : 0.4));
  return (
    <span
      data-token-fallback={letters}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full border border-line bg-raised font-mono font-medium leading-none text-ink-2",
        className,
      )}
      style={{ width: size, height: size, fontSize }}
      {...a11yProps(title)}
    >
      {letters}
    </span>
  );
}

function ImageMark({ image, tokenKey, size, className, title }: MarkProps & { image: StaticImageData; tokenKey: string }): ReactNode {
  return (
    <Image
      src={image}
      width={size}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      data-token-icon={tokenKey}
      className={clsx("shrink-0 rounded-full", className)}
    />
  );
}
