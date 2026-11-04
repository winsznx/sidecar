"use client";

import { Calculator, Check, Link2, TriangleAlert, Unlink2, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AccountBadge, AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { ChoiceCard, ChoiceCardGroup } from "@/components/ui/choice-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { NumberField } from "@/components/ui/number-field";
import { Panel, PanelStrip } from "@/components/ui/panel";
import { ProvenanceBadge, provenanceRuleClass } from "@/components/ui/provenance-badge";
import { RiskPill } from "@/components/ui/risk-pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SideTag } from "@/components/ui/side-tag";
import { SidecarMark } from "@/components/ui/sidecar-mark";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";

import {
  SAMPLE_ACCOUNT_A,
  SAMPLE_ACCOUNT_B,
  SAMPLE_ACCOUNTS,
  SAMPLE_NETWORK,
  SAMPLE_ORDER,
  SAMPLE_POSITION,
  SIMULATED,
  SIMULATED_ESTIMATE,
} from "./sample-data";

type Route = "a" | "b";
type Market = "BTC-PERP" | "ETH-PERP";
type Side = "long" | "short";
type TimeInForce = "GTC" | "IOC";

const SIM_RULE = provenanceRuleClass(SIMULATED.kind);

function StudyTopBar(): ReactNode {
  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-3 md:flex md:px-5">
      <SidecarMark size="sm" />
      <p className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:border-l md:border-line md:pl-4">
        <span className="text-small text-ink-2">
          {SAMPLE_NETWORK.name} · {SAMPLE_NETWORK.chainId}
        </span>
        <span className="type-data text-caption text-ink-3">
          Block {SAMPLE_NETWORK.block} · {SAMPLE_NETWORK.age} old
        </span>
      </p>
      <span className="col-start-2 row-start-1 inline-flex items-center gap-3 md:ml-auto">
        <span className="hidden h-6 items-center whitespace-nowrap rounded-full border border-line-strong px-2.5 text-caption text-ink-2 sm:inline-flex">
          Paper funds only
        </span>
        <span className="inline-flex min-w-0 items-center gap-2 rounded-sm border border-line bg-raised py-1.5 pr-2.5 pl-2">
          <Wallet aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
          <span className="sr-only">Connected wallet:</span>
          <AccountLetter account="B" size="sm" />
          <span className="type-data text-caption text-ink-2">{SAMPLE_ACCOUNTS.B.short}</span>
        </span>
      </span>
      <span className="col-span-2 row-start-3 inline-flex h-6 w-fit items-center whitespace-nowrap rounded-full border border-line-strong px-2.5 text-caption text-ink-2 sm:hidden">
        Paper funds only
      </span>
    </header>
  );
}

function PositionsPanel(): ReactNode {
  return (
    <Panel
      variant="viewfinder"
      strip={
        <PanelStrip
          status="simulated"
          items={[`Hideki ${SAMPLE_NETWORK.chainId}`, `Block ${SAMPLE_NETWORK.block}`]}
          age={SAMPLE_NETWORK.age}
        />
      }
      eyebrow={<Eyebrow index={1}>Your positions</Eyebrow>}
      title={
        <AccountBadge
          account="A"
          label={SAMPLE_ACCOUNTS.A.label}
          address={SAMPLE_ACCOUNTS.A.address}
          shortAddress={SAMPLE_ACCOUNTS.A.short}
          copyable={false}
        />
      }
      titleAs="h3"
      actions={<RiskPill state="healthy" size="sm" />}
    >
      <div className="-mx-4 hidden sm:block md:-mx-5">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">Open positions on the main account (simulated sample)</caption>
          <thead>
            <tr className="border-y border-line text-left text-caption whitespace-nowrap text-ink-3">
              <th scope="col" className="py-2 pr-3 pl-4 font-medium md:pl-5">
                Market
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Side
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Size
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Entry
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Mark
              </th>
              <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium md:pr-5">
                Unrealized PnL
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line whitespace-nowrap">
              <th scope="row" className="py-3 pr-3 pl-4 text-left font-semibold text-ink md:pl-5">
                {SAMPLE_POSITION.market}
              </th>
              <td className="px-3 py-3">
                <SideTag side={SAMPLE_POSITION.side} size="sm" />
              </td>
              <td className="px-3 py-3 text-right text-ink tabular">
                <span className={SIM_RULE}>{SAMPLE_POSITION.size}</span>{" "}
                <span className="text-ink-3">{SAMPLE_POSITION.sizeUnit}</span>
              </td>
              <td className="px-3 py-3 text-right text-ink tabular">
                <span className={SIM_RULE}>{SAMPLE_POSITION.entry}</span>
              </td>
              <td className="px-3 py-3 text-right text-ink tabular">
                <span className={SIM_RULE}>{SAMPLE_POSITION.mark}</span>
              </td>
              <td className="py-3 pr-4 pl-3 text-right font-medium text-short tabular md:pr-5">
                <span className={SIM_RULE}>{SAMPLE_POSITION.unrealizedPnl}</span>{" "}
                <span className="font-normal text-ink-3">USDso</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-y border-line py-3 sm:hidden">
        <p className="flex items-center gap-2">
          <span className="text-body font-semibold text-ink">{SAMPLE_POSITION.market}</span>
          <SideTag side={SAMPLE_POSITION.side} size="sm" />
          <span className="ml-auto text-small text-ink tabular">
            <span className={SIM_RULE}>{SAMPLE_POSITION.size}</span> <span className="text-ink-3">{SAMPLE_POSITION.sizeUnit}</span>
          </span>
        </p>
        <KeyValueList
          density="compact"
          badges={false}
          items={[
            { id: "entry", label: "Entry", value: SAMPLE_POSITION.entry, source: SIMULATED },
            { id: "mark", label: "Mark", value: SAMPLE_POSITION.mark, source: SIMULATED },
            {
              id: "pnl",
              label: "Unrealized PnL",
              value: <span className="text-short">{SAMPLE_POSITION.unrealizedPnl} USDso</span>,
              source: SIMULATED,
            },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Stat state="known" label="Equity" value={SAMPLE_ACCOUNT_A.equity} unit="USDso" source={SIMULATED} badge={false} size="sm" />
        <Stat state="known" label="Free collateral" value={SAMPLE_ACCOUNT_A.available} unit="USDso" source={SIMULATED} badge={false} size="sm" />
        <Stat state="known" label="Maintenance" value={SAMPLE_ACCOUNT_A.maintenance} unit="USDso" source={SIMULATED} badge={false} size="sm" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed border-line-strong px-3 py-2.5">
        <AccountBadge
          account="B"
          label={SAMPLE_ACCOUNTS.B.label}
          address={SAMPLE_ACCOUNTS.B.address}
          shortAddress={SAMPLE_ACCOUNTS.B.short}
          size="sm"
        />
        <span className="text-small text-ink-2 sm:ml-auto">No open positions</span>
      </div>
    </Panel>
  );
}

function OrderTicket(): ReactNode {
  const [market, setMarket] = useState<Market>("BTC-PERP");
  const [side, setSide] = useState<Side>("long");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [price, setPrice] = useState<string>(SAMPLE_ORDER.price);
  const [size, setSize] = useState<string>(SAMPLE_ORDER.size);

  return (
    <Panel
      eyebrow={<Eyebrow index={2}>New trade</Eyebrow>}
      title="Order ticket"
      titleAs="h3"
      actions={<ProvenanceBadge source={SIMULATED} size="sm" />}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SegmentedControl
            label="Market"
            value={market}
            onValueChange={setMarket}
            block
            options={[
              { value: "BTC-PERP", label: "BTC-PERP" },
              { value: "ETH-PERP", label: "ETH-PERP" },
            ]}
          />
          <SegmentedControl
            label="Side"
            value={side}
            onValueChange={setSide}
            block
            options={[
              { value: "long", label: "Long", tone: "long" },
              { value: "short", label: "Short", tone: "short" },
            ]}
          />
        </div>
        <SegmentedControl
          label="Order type"
          value={timeInForce}
          onValueChange={setTimeInForce}
          size="sm"
          block
          options={[
            { value: "GTC", label: "Limit, rests until filled" },
            { value: "IOC", label: "Fill now or cancel" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Limit price"
            value={price}
            onValueChange={setPrice}
            suffix="USDso"
            hint={`Tick ${SAMPLE_ORDER.tick} USDso`}
          />
          <NumberField
            label="Size"
            value={size}
            onValueChange={setSize}
            suffix="BTC"
            hint={`Min ${SAMPLE_ORDER.minSize}, steps of ${SAMPLE_ORDER.lot}`}
            labelAction={
              <button
                type="button"
                onClick={() => setSize(SAMPLE_ORDER.maxSizeB)}
                className="inline-flex items-center rounded-xs type-data text-caption text-ink-2 underline decoration-line-strong underline-offset-2 focus-ring hover:text-ink pointer-coarse:min-h-10 pointer-coarse:px-2"
              >
                Max {SAMPLE_ORDER.maxSizeB}
              </button>
            }
          />
        </div>
        <KeyValueList
          density="compact"
          badges={false}
          items={[
            { id: "mark", label: "Mark price", value: `${SAMPLE_ORDER.mark} USDso`, source: SIMULATED },
            { id: "notional", label: "Notional", value: `${SAMPLE_ORDER.notional} USDso`, source: SIMULATED },
            { id: "max", label: "Max size in account B", value: `${SAMPLE_ORDER.maxSizeB} BTC`, source: SIMULATED },
          ]}
        />
        <p className="text-caption text-ink-3">Nothing is sent while you edit. The order is signed only in step 04.</p>
      </div>
    </Panel>
  );
}

function SharesCollateral({ shares }: { shares: boolean }): ReactNode {
  const Icon = shares ? Link2 : Unlink2;
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-line bg-sunken px-3 py-2.5">
      <span className="text-small text-ink-2">Shares collateral with your {SAMPLE_POSITION.market} position</span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-title font-semibold text-ink">
        <Icon aria-hidden="true" className="size-4 text-ink-2" strokeWidth={2.25} />
        <span className={SIM_RULE}>{shares ? "Yes" : "No"}</span>
      </span>
    </div>
  );
}

function ProjectedRows({ items }: { items: ReadonlyArray<KeyValueItem> }): ReactNode {
  return (
    <div className="outline-estimate rounded-xs">
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="type-eyebrow text-ink-3">Projected after this trade</span>
        <ProvenanceBadge source={SIMULATED_ESTIMATE} size="sm" />
      </div>
      <KeyValueList density="compact" badges={false} items={items} />
    </div>
  );
}

function CardFooter({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {children}
      <ProvenanceBadge source={SIMULATED} size="sm" />
    </div>
  );
}

function RouteComparison({ route, onRouteChange }: { route: Route; onRouteChange: (route: Route) => void }): ReactNode {
  return (
    <section aria-labelledby="study-compare-eyebrow" className="flex min-w-0 flex-col gap-4">
      <Eyebrow index={3} id="study-compare-eyebrow">
        Choose the account
      </Eyebrow>
      <ChoiceCardGroup
        legend="Where should this trade live?"
        legendClassName="type-display mb-2 text-heading leading-tight text-ink md:text-display"
        intro={
          <p className="mb-5 max-w-measure text-body text-ink-2">
            The same BTC order, held two ways. Pick one; nothing is sent until you sign.
          </p>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            name="study-route"
            value="a"
            tone="a"
            checked={route === "a"}
            onSelect={() => onRouteChange("a")}
            title="Share with my current positions"
            description="BTC on this account shares collateral with your existing ETH position."
            header={
              <AccountBadge
                account="A"
                label={SAMPLE_ACCOUNTS.A.label}
                address={SAMPLE_ACCOUNTS.A.address}
                shortAddress={SAMPLE_ACCOUNTS.A.short}
                size="sm"
              />
            }
            footer={
              <CardFooter>
                <StatusPill tone="positive" icon={Check} size="sm">
                  Enough free collateral
                </StatusPill>
              </CardFooter>
            }
          >
            <SharesCollateral shares />
            <KeyValueList
              density="compact"
              badges={false}
              items={[{ id: "equity", label: "Equity", value: `${SAMPLE_ACCOUNT_A.equity} USDso`, source: SIMULATED }]}
            />
            <ProjectedRows
              items={[
                { id: "im", label: "Initial margin, this trade", value: `${SAMPLE_ORDER.initialMargin} USDso`, source: SIMULATED_ESTIMATE },
                { id: "mm", label: "Maintenance after", value: `${SAMPLE_ORDER.maintenanceAfterA} USDso`, source: SIMULATED_ESTIMATE },
                { id: "free", label: "Free after", value: `${SAMPLE_ORDER.freeAfterA} USDso`, source: SIMULATED_ESTIMATE },
              ]}
            />
            <p className="text-small text-ink-2">
              <span className="font-medium text-ink">Trade-off.</span> Profit and loss can offset across both positions,
              and a loss on either draws on the same collateral.
            </p>
          </ChoiceCard>

          <ChoiceCard
            name="study-route"
            value="b"
            tone="b"
            checked={route === "b"}
            onSelect={() => onRouteChange("b")}
            title="Give this trade its own margin"
            description="BTC in your second wallet uses a different margin balance."
            header={
              <AccountBadge
                account="B"
                label={SAMPLE_ACCOUNTS.B.label}
                address={SAMPLE_ACCOUNTS.B.address}
                shortAddress={SAMPLE_ACCOUNTS.B.short}
                size="sm"
              />
            }
            footer={
              <CardFooter>
                <StatusPill tone="positive" icon={Check} size="sm">
                  Funded, has gas
                </StatusPill>
              </CardFooter>
            }
          >
            <SharesCollateral shares={false} />
            <KeyValueList
              density="compact"
              badges={false}
              items={[{ id: "equity", label: "Equity", value: `${SAMPLE_ACCOUNT_B.equity} USDso`, source: SIMULATED }]}
            />
            <ProjectedRows
              items={[
                { id: "im", label: "Initial margin, this trade", value: `${SAMPLE_ORDER.initialMargin} USDso`, source: SIMULATED_ESTIMATE },
                { id: "mm", label: "Maintenance after", value: `${SAMPLE_ORDER.maintenanceAfterB} USDso`, source: SIMULATED_ESTIMATE },
                { id: "free", label: "Free after", value: `${SAMPLE_ORDER.freeAfterB} USDso`, source: SIMULATED_ESTIMATE },
              ]}
            />
            <p className="text-small text-ink-2">
              <span className="font-medium text-ink">Trade-off.</span> It needs its own margin and gas, and capital split
              across two accounts cannot back each other.
            </p>
          </ChoiceCard>
        </div>
      </ChoiceCardGroup>
      <p className="text-caption text-ink-3">
        Separate accounts limit shared collateral exposure, but use capital less efficiently. Liquidation is still
        possible in either account.
      </p>
    </section>
  );
}

function CalculationsSheet(): ReactNode {
  return (
    <SheetContent
      eyebrow={<Eyebrow>Exact calculations</Eyebrow>}
      title="How the comparison was built"
      description="Every input and result behind both cards, with where it came from."
    >
      <div className="flex flex-col gap-6">
        <InlineAlert tone="neutral" title="Simulated sample">
          In the product each row names its source: CHAIN or SDK with the block it was read at, or EST with the basis of
          the estimate.
        </InlineAlert>
        {(["A", "B"] as const).map((account) => {
          const sample = account === "A" ? SAMPLE_ACCOUNT_A : SAMPLE_ACCOUNT_B;
          return (
            <div key={account} className="flex flex-col gap-2">
              <AccountBadge
                account={account}
                label={SAMPLE_ACCOUNTS[account].label}
                address={SAMPLE_ACCOUNTS[account].address}
                shortAddress={SAMPLE_ACCOUNTS[account].short}
                size="sm"
              />
              <KeyValueList
                density="compact"
                items={[
                  { id: "eq", label: "Equity", value: `${sample.equity} USDso`, source: SIMULATED },
                  { id: "fc", label: "Free collateral", value: `${sample.available} USDso`, source: SIMULATED },
                  {
                    id: "im",
                    label: `Initial margin for ${SAMPLE_ORDER.size} BTC`,
                    value: `${SAMPLE_ORDER.initialMargin} USDso`,
                    source: SIMULATED_ESTIMATE,
                  },
                  {
                    id: "mm",
                    label: "Maintenance after the trade",
                    value: `${account === "A" ? SAMPLE_ORDER.maintenanceAfterA : SAMPLE_ORDER.maintenanceAfterB} USDso`,
                    source: SIMULATED_ESTIMATE,
                  },
                  {
                    id: "free",
                    label: "Free after the trade",
                    value: `${account === "A" ? SAMPLE_ORDER.freeAfterA : SAMPLE_ORDER.freeAfterB} USDso`,
                    source: SIMULATED_ESTIMATE,
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
    </SheetContent>
  );
}

function SignBar({ route }: { route: Route }): ReactNode {
  const account = route === "a" ? "A" : "B";
  const target = SAMPLE_ACCOUNTS[account];
  const walletMatches = route === "b";

  return (
    <div className="sticky bottom-0 z-sticky border-t border-line bg-panel shadow-sticky">
      <div className="flex flex-col gap-2.5 px-4 py-3 md:flex-row md:items-center md:gap-6 md:px-5">
        <p className="flex items-center justify-between gap-3 type-data text-caption text-ink-3 md:hidden">
          <span>
            Hideki {SAMPLE_NETWORK.chainId} · {SAMPLE_NETWORK.age}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="sr-only">Connected wallet:</span>
            <AccountLetter account="B" size="sm" />
            <span className="text-ink-2">{SAMPLE_ACCOUNTS.B.short}</span>
          </span>
        </p>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 md:flex-col md:flex-nowrap md:items-start md:gap-1.5">
          <Eyebrow index={4} className="hidden md:block">
            Sign
          </Eyebrow>
          {walletMatches ? (
            <StatusPill tone="positive" icon={Check} size="sm">
              Connected wallet is account B
            </StatusPill>
          ) : (
            <StatusPill tone="warning" icon={TriangleAlert} size="sm">
              Connected wallet is B, not A
            </StatusPill>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs text-small text-ink-2 underline decoration-line-strong underline-offset-4 focus-ring hover:text-ink md:hidden pointer-coarse:min-h-10"
              >
                <Calculator aria-hidden="true" className="size-3.5" />
                Exact calculations
              </button>
            </SheetTrigger>
            <CalculationsSheet />
          </Sheet>
        </div>
        <div className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-start">
          <div className="hidden md:block">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="lg" leading={<Calculator aria-hidden="true" className="size-4" />}>
                  See exact calculations
                </Button>
              </SheetTrigger>
              <CalculationsSheet />
            </Sheet>
          </div>
          <Button
            size="lg"
            tone={route}
            block
            leading={<AccountLetter account={account} size="sm" appearance="on-fill" />}
            disabledReason={walletMatches ? undefined : `Wallet mismatch: switch to ${target.short} before signing.`}
            className="max-md:px-4 max-md:text-body md:w-auto"
            wrapperClassName="md:w-auto md:items-end"
          >
            Place BTC trade in <span className="whitespace-nowrap">{target.short}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The /trade hero as a composition study: hierarchy, density and the comparison as the climax. */
export function TradeStudy(): ReactNode {
  const [route, setRoute] = useState<Route>("b");

  return (
    <div className="overflow-clip rounded-lg border border-line-strong bg-canvas">
      <div className="hatch-sim flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="rounded-xs bg-panel px-2 py-0.5 type-eyebrow text-ink">Composition study · simulated data</span>
        <span className="hidden rounded-xs bg-panel px-2 py-0.5 text-caption text-ink-2 sm:inline">
          Trade screen after the trader picked a route
        </span>
      </div>
      <StudyTopBar />
      <div className="grid gap-4 p-4 md:p-5 lg:grid-cols-[11fr_9fr] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <PositionsPanel />
          <OrderTicket />
        </div>
        <RouteComparison route={route} onRouteChange={setRoute} />
      </div>
      <SignBar route={route} />
    </div>
  );
}
