"use client";

import { Copy, Inbox, RefreshCw, Settings2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AccountBadge, AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { ChoiceCard, ChoiceCardGroup } from "@/components/ui/choice-card";
import { cx } from "@/components/ui/cx";
import { Dialog, DialogClose, DialogContent, DialogTrigger, type Surface } from "@/components/ui/dialog";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconButton } from "@/components/ui/icon-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList } from "@/components/ui/key-value-list";
import { Kbd } from "@/components/ui/kbd";
import { NumberField } from "@/components/ui/number-field";
import { Panel, PanelStrip, type FeedStatus } from "@/components/ui/panel";
import { ProvenanceBadge, provenanceRuleClass } from "@/components/ui/provenance-badge";
import { RiskPill } from "@/components/ui/risk-pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SideTag } from "@/components/ui/side-tag";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Stamp } from "@/components/ui/stamp";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { Tooltip } from "@/components/ui/tooltip";
import { Unavailable } from "@/components/ui/unavailable";
import type { Source } from "@/lib/dreamdex/types";

import { Specimen } from "./guide-section";
import { SAMPLE_ACCOUNTS, SIMULATED } from "./sample-data";

/** Badge specimens. Kinds are shown for styling; none of these numbers were read from a chain. */
const SPECIMEN_SOURCES: ReadonlyArray<{ name: string; source: Source }> = [
  { name: "Chain read", source: { kind: "chain", block: 38_357_692n, readAt: "2026-11-01T12:04:31Z", via: "getMarginAccount" } },
  { name: "SDK calculation", source: { kind: "sdk", block: 38_357_692n, readAt: "2026-11-01T12:04:31Z", via: "previewPerpOrderMargin" } },
  { name: "Indexed", source: { kind: "indexer", readAt: "2026-11-01T12:04:29Z", via: "listPerpMarkets", updatedAtBlock: 38_357_640n } },
  { name: "Sidecar estimate", source: { kind: "estimate", basis: "Sidecar arithmetic over SDK inputs" } },
  { name: "Scenario", source: { kind: "scenario", basis: "BTC moved -12% from mark" } },
  { name: "Simulated", source: SIMULATED },
];

const FEEDS: ReadonlyArray<FeedStatus> = ["live", "stale", "degraded", "simulated"];

function Row({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={cx("flex flex-wrap items-center gap-3", className)}>{children}</div>;
}

function FlashDemo(): ReactNode {
  const values = ["2,418.73", "2,409.10", "2,431.55"];
  const [index, setIndex] = useState(0);
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Stat state="known" label="Equity" value={values[index] ?? values[0] ?? ""} unit="USDso" source={SIMULATED} className="w-48" />
      <Button variant="secondary" size="sm" onClick={() => setIndex((index + 1) % values.length)}>
        Change value
      </Button>
    </div>
  );
}

export function PrimitiveGallery({ surface }: { surface: Surface }): ReactNode {
  const [side, setSide] = useState<"long" | "short">("long");
  const [scope, setScope] = useState<"all" | "a" | "b">("all");
  const [shock, setShock] = useState(-12);
  const [price, setPrice] = useState("77,412.5");
  const [size, setSize] = useState("0.000071");
  const [route, setRoute] = useState<"a" | "b" | null>(null);

  return (
    <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
      <Specimen label="Buttons" className="lg:col-span-2">
        <Row>
          <Button variant="accent">Open the trade screen</Button>
          <Button>Review order</Button>
          <Button tone="a">Place in account A</Button>
          <Button tone="b">Place in account B</Button>
          <Button variant="secondary">Refresh</Button>
          <Button variant="secondary" tone="a">
            Use account A
          </Button>
          <Button variant="secondary" tone="b">
            Use account B
          </Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Cancel order</Button>
        </Row>
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large, for the sign bar</Button>
        </Row>
        <Row className="items-start">
          <Button loading loadingLabel="Waiting for wallet" tone="b">
            Place BTC trade
          </Button>
          <Button disabled>Native disabled</Button>
          <Button disabledReason="Account B needs 12.40 USDso more margin.">Place in account B</Button>
        </Row>
        <Row>
          <IconButton label="Refresh readings" icon={<RefreshCw aria-hidden="true" />} />
          <IconButton label="Copy address" icon={<Copy aria-hidden="true" />} variant="secondary" />
          <IconButton label="Settings" icon={<Settings2 aria-hidden="true" />} variant="secondary" tooltip />
          <IconButton label="Refresh unavailable" icon={<RefreshCw aria-hidden="true" />} disabled />
        </Row>
      </Specimen>

      <Specimen label="Status, risk and direction">
        <Row>
          <StatusPill>Neutral</StatusPill>
          <StatusPill tone="positive">Filled</StatusPill>
          <StatusPill tone="warning">Resting</StatusPill>
          <StatusPill tone="danger">Reverted</StatusPill>
        </Row>
        <Row>
          <StatusPill appearance="outline">Paper funds only</StatusPill>
          <StatusPill appearance="outline" tone="positive" size="sm">
            Chain 50383
          </StatusPill>
          <StatusPill appearance="outline" tone="danger" size="sm">
            Wrong network
          </StatusPill>
        </Row>
        <Row>
          <RiskPill state="healthy" />
          <RiskPill state="margin-call" />
          <RiskPill state="liquidation-risk" />
          <RiskPill state="unknown" label="Unknown: market cannot be priced" />
        </Row>
        <Row>
          <SideTag side="long" />
          <SideTag side="short" />
          <SideTag side="long" size="sm" />
          <SideTag side="short" size="sm" />
        </Row>
      </Specimen>

      <Specimen label="Stamps (verdicts on records)">
        <Row className="items-start gap-6">
          <Stamp status="verified" detail="6 / 6 checks" />
          <Stamp status="not-verified" detail="Sender differs from the selected account" />
          <Stamp status="pending" detail="Waiting for receipt" />
        </Row>
      </Specimen>

      <Specimen label="Provenance badges">
        <ul className="flex flex-col gap-2.5">
          {SPECIMEN_SOURCES.map(({ name, source }) => (
            <li key={name} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-small text-ink-2">{name}</span>
              <span className="flex items-center gap-3">
                <span className={cx("text-body font-semibold text-ink tabular", provenanceRuleClass(source.kind))}>12,408.19</span>
                <ProvenanceBadge source={source} />
              </span>
            </li>
          ))}
        </ul>
      </Specimen>

      <Specimen label="Unavailable is never zero">
        <Unavailable reason="The protocol cannot price this market right now." />
        <p className="text-small text-ink-2">
          Inline, in a table cell: <Unavailable variant="inline" reason="Mark price is stale." />
        </p>
      </Specimen>

      <Specimen label="Figures">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <Stat
            state="known"
            label="Equity"
            value="2,418.73"
            unit="USDso"
            source={{ kind: "chain", block: 38_357_692n, readAt: "2026-11-01T12:04:31Z", via: "getMarginAccount" }}
          />
          <Stat
            state="known"
            label="Maintenance after"
            value="236.92"
            unit="USDso"
            source={{ kind: "estimate", basis: "Sidecar arithmetic over SDK inputs" }}
          />
          <Stat state="known" label="Unrealized PnL" value="-30.56" unit="USDso" emphasis="short" source={SIMULATED} />
          <Stat state="unavailable" label="Liquidation price" reason="Unpriceable market in this account." />
          <Stat state="loading" label="Free collateral" />
          <Stat state="known" label="Gas" value="0.84" unit="STT" size="sm" source={SIMULATED} />
        </div>
        <Stat state="known" label="Hero figure" value="1,006.36" unit="USDso" size="lg" source={SIMULATED} />
        <Stat state="known" label="Headline figure, size xl" value="1,006.36" unit="USDso" size="xl" source={SIMULATED} />
      </Specimen>

      <Specimen label="Value change">
        <FlashDemo />
      </Specimen>

      <Specimen label="Accounts">
        <div className="flex flex-col gap-3">
          <AccountBadge account="A" label={SAMPLE_ACCOUNTS.A.label} address={SAMPLE_ACCOUNTS.A.address} />
          <AccountBadge account="B" label={SAMPLE_ACCOUNTS.B.label} address={SAMPLE_ACCOUNTS.B.address} />
          <AccountBadge account="B" label="Connected" address={SAMPLE_ACCOUNTS.B.address} size="sm" copyable={false} />
        </div>
        <Row>
          <AccountLetter account="A" size="sm" />
          <AccountLetter account="A" />
          <AccountLetter account="A" size="lg" />
          <AccountLetter account="B" size="sm" />
          <AccountLetter account="B" />
          <AccountLetter account="B" size="lg" />
        </Row>
      </Specimen>

      <Specimen label="Route cards" className="lg:col-span-2">
        <ChoiceCardGroup legend="Where should this trade live?" legendClassName="mb-3 text-body font-semibold text-ink">
          <div className="grid gap-3 md:grid-cols-3">
            <ChoiceCard
              name={`gallery-route-${surface}`}
              value="a"
              tone="a"
              checked={route === "a"}
              onSelect={() => setRoute("a")}
              title="Share with my current positions"
              description="Unselected until the trader picks it."
              header={
                <AccountBadge account="A" label={SAMPLE_ACCOUNTS.A.label} address={SAMPLE_ACCOUNTS.A.address} size="sm" />
              }
            />
            <ChoiceCard
              name={`gallery-route-${surface}`}
              value="b"
              tone="b"
              checked={route === "b"}
              onSelect={() => setRoute("b")}
              title="Give this trade its own margin"
              description="Select either card to see the checked state."
              header={
                <AccountBadge account="B" label={SAMPLE_ACCOUNTS.B.label} address={SAMPLE_ACCOUNTS.B.address} size="sm" />
              }
            />
            <ChoiceCard
              name={`gallery-route-${surface}`}
              value="watch"
              checked={false}
              onSelect={() => undefined}
              disabled
              title="Watch-only address"
              description="It can be compared, but it cannot sign, so it cannot be selected."
            />
          </div>
        </ChoiceCardGroup>
      </Specimen>

      <Specimen label="Choices">
        <SegmentedControl
          label="Side"
          value={side}
          onValueChange={setSide}
          options={[
            { value: "long", label: "Long", tone: "long" },
            { value: "short", label: "Short", tone: "short" },
          ]}
        />
        <SegmentedControl
          label="Accounts shown"
          value={scope}
          onValueChange={setScope}
          size="sm"
          options={[
            { value: "all", label: "Both" },
            { value: "a", label: "A only", tone: "a" },
            { value: "b", label: "B only", tone: "b" },
          ]}
        />
        <SegmentedControl
          label="Order type"
          value="GTC"
          onValueChange={() => undefined}
          size="sm"
          options={[
            { value: "GTC", label: "Limit" },
            { value: "IOC", label: "Fill now or cancel", disabled: true },
          ]}
        />
      </Specimen>

      <Specimen label="Fields">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Limit price" value={price} onValueChange={setPrice} suffix="USDso" hint="Tick 0.1 USDso" />
          <NumberField
            label="Size"
            value={size}
            onValueChange={setSize}
            suffix="BTC"
            hint="Min 0.00013, steps of 0.00001"
            error="Below the minimum size of 0.00013 BTC."
          />
          <TextField label="Label for this wallet" placeholder="e.g. Sidecar, BTC only" />
          <TextField label="Watch address" value="0x9c3F…1A41" readOnly disabled hint="Watch-only addresses cannot sign." />
        </div>
      </Specimen>

      <Specimen label="Scenario input">
        <Slider
          label="Hypothetical BTC move"
          value={shock}
          onValueChange={setShock}
          min={-30}
          max={30}
          origin={0}
          valueText={`BTC ${shock > 0 ? "+" : ""}${shock}%`}
          minLabel="-30%"
          maxLabel="+30%"
          badge={<ProvenanceBadge source={{ kind: "scenario", basis: `BTC moved ${shock}% from mark` }} size="sm" />}
        />
      </Specimen>

      <Specimen label="Panels" className="lg:col-span-2">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel
            title="Panel title"
            eyebrow={<Eyebrow index={2}>New trade</Eyebrow>}
            actions={<IconButton label="Refresh" icon={<RefreshCw aria-hidden="true" />} />}
            titleAs="h3"
          >
            <p className="text-small text-ink-2">Default panel: hairline border and a soft card shadow.</p>
          </Panel>
          {FEEDS.map((status) => (
            <Panel
              key={status}
              variant="viewfinder"
              titleAs="h3"
              strip={
                <PanelStrip
                  status={status}
                  items={["Hideki 50383", "Block 38,357,692"]}
                  age={status === "stale" ? "41s" : "2s"}
                />
              }
            >
              <p className="text-small text-ink-2">Viewfinder panel, strip status: {status}.</p>
            </Panel>
          ))}
        </div>
      </Specimen>

      <Specimen label="Inspection rows">
        <KeyValueList
          items={[
            {
              id: "eq",
              label: "Equity",
              value: "2,418.73 USDso",
              source: { kind: "chain", block: 38_357_692n, readAt: "2026-11-01T12:04:31Z", via: "getMarginAccount" },
            },
            { id: "mm", label: "Maintenance after", value: "236.92 USDso", source: { kind: "estimate", basis: "Sidecar arithmetic over SDK inputs" } },
            { id: "sim", label: "Sample row", value: "600.00 USDso", source: SIMULATED },
          ]}
        />
        <KeyValueList
          leaders
          density="compact"
          items={[
            { id: "chain", label: "Chain is 50383", value: "Hideki", check: "pass" },
            { id: "sender", label: "Sender is the selected account", value: "0x9c3F7b…1A41", check: "pass" },
            { id: "fill", label: "Fill reported by indexer", value: "Waiting", check: "unknown" },
            { id: "other", label: "Main account margin untouched", value: "Changed", check: "fail" },
          ]}
        />
      </Specimen>

      <Specimen label="Alerts">
        <InlineAlert title="Order confirmed, not filled.">It is resting on the book. Order id 184,467,203.</InlineAlert>
        <InlineAlert tone="positive" title="Account reconciled">Both accounts were re-read at block 38,357,701.</InlineAlert>
        <InlineAlert
          tone="warning"
          title="Wallet mismatch"
          action={
            <Button variant="secondary" size="sm">
              Switch wallet
            </Button>
          }
        >
          Switch to {SAMPLE_ACCOUNTS.A.short} before signing.
        </InlineAlert>
        <InlineAlert tone="danger" title="Reverted: InsufficientCollateral">
          Nothing was placed. Add margin to account B or reduce the size, then review again.
        </InlineAlert>
      </Specimen>

      <Specimen label="Empty and loading">
        <EmptyState
          icon={Inbox}
          title="No open positions on this account"
          action={
            <Button variant="secondary" size="sm">
              Refresh
            </Button>
          }
        >
          Positions appear here after a fill. Resting orders are listed separately.
        </EmptyState>
        <div aria-busy="true" className="flex flex-col gap-3 rounded-md border border-line p-4">
          <span className="sr-only">Loading account</span>
          <div className="flex items-center gap-3">
            <Skeleton shape="pill" />
            <Skeleton className="h-4 w-32" />
          </div>
          <SkeletonText lines={3} />
          <Skeleton shape="block" />
        </div>
      </Specimen>

      <Specimen label="Type helpers">
        <Eyebrow index={3}>Choose the account</Eyebrow>
        <Eyebrow>Exact calculations</Eyebrow>
        <p className="text-small text-ink-2">
          Press <Kbd>Esc</Kbd> to close, <Kbd>Tab</Kbd> to move, <Kbd>←</Kbd> <Kbd>→</Kbd> to switch routes.
        </p>
        <Divider />
        <Divider variant="dashed" />
        <Divider variant="double" />
        <Divider label="or" />
        <div className="flex h-8 items-center gap-3 text-small text-ink-2">
          Left
          <Divider orientation="vertical" />
          Right
        </div>
      </Specimen>

      <Specimen label="Overlays">
        <Row>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent
              surface={surface}
              title="Send this order from account B?"
              description="You are about to sign with 0x9c3F7b…1A41. Nothing has been sent yet."
              actions={
                <>
                  <DialogClose asChild>
                    <Button variant="ghost">Go back</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button tone="b">Sign in wallet</Button>
                  </DialogClose>
                </>
              }
            >
              <KeyValueList
                density="compact"
                items={[
                  { id: "m", label: "Market", value: "BTC-PERP" },
                  { id: "s", label: "Side and size", value: "Long 0.01300 BTC" },
                  { id: "p", label: "Limit price", value: "77,412.5 USDso" },
                ]}
              />
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Open sheet</Button>
            </SheetTrigger>
            <SheetContent surface={surface} eyebrow={<Eyebrow>Exact calculations</Eyebrow>} title="Sheet title" description="Detail that should not leave the screen.">
              <SkeletonText lines={4} />
            </SheetContent>
          </Sheet>
          <Tooltip content="Read at block 38,357,692 via getMarginAccount">
            <span tabIndex={0} className="rounded-xs focus-ring">
              <ProvenanceBadge source={SPECIMEN_SOURCES[0]?.source ?? SIMULATED} />
            </span>
          </Tooltip>
        </Row>
      </Specimen>
    </div>
  );
}
