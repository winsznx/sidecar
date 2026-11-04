# dreamDEX SDK notes

Facts about `@somnia-chain/markets-sdk` 0.32.1 as installed in this repo, checked against its
`dist/**/*.d.ts` and against Somnia Hideki (chain id 50383) on 2026-11-01. Paths below are
relative to `node_modules/@somnia-chain/markets-sdk/`. Where something was observed rather
than read in a type, it says so.

## Construction and transport

- `new SomniaMarkets({ chain, wsRpcUrl, indexerUrl, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES })`
  opens nothing at construction. The first chain read dials the WebSocket. Sidecar builds the
  browser root lazily (`getBrowserMarkets`) and never on the server (`lib/dreamdex/client.ts`).
- Chain reads go over the WebSocket only. `client.getViemClient()` returns the SDK's own viem
  client on that socket and throws `NotConfiguredError` without `wsRpcUrl`
  (`dist/somniaMarketsClient.d.ts:296-308`). A client taken before a socket reset rejects every
  request, so the adapter asks for it fresh per call.
- The SDK chain definition for Hideki sets `blockTime: 10` (`dist/chains/index.d.ts:205`). viem
  derives its default polling interval from it (500 ms floor), which is one reason Sidecar does not
  lean on viem's block-driven receipt watcher (see "Receipt waiting").
- `setSigner({ walletClient })` binds a wallet and `setSigner({})` unbinds it. The SDK does not
  switch or check chains, so `bindSigner` refuses a wallet whose chain is not 50383 before binding.

## Reads Sidecar uses

All of these are `markets.client.*` and were called live with the shapes recorded in
`lib/dreamdex/types.ts`.

| Read | Pinnable to a block | Notes |
| --- | --- | --- |
| `listPerpMarkets()` | no (indexer) | 21 perp markets on 2026-11-01. Numeric fields are decimal strings by design: `tickSize`, `lotSize`, `minQuantity` are typed `string`, `markPrice` `string \| null` (`dist/markets.d.ts:88-98`). `normalizeMarket` converts with `BigInt` and keeps null as null. |
| `listPerpPoolStatuses({ factory })` | no | Factory-side tradeable gate per pool. |
| `getPerpSystemConfig(marginBank)` | no | `collateralToken` is USDso `0xed79...4F72`. Use it or `market.quoteToken`, never the address bundle's `collateral`. |
| `getPerpHealthSnapshot(pool)` | no | `priceable: false` is a real state; Sidecar shows it as "cannot price", never as zero. |
| `getMarginAccount(bank, account)` | no, reports `asOfBlock` | `dist/somniaMarketsClient.d.ts:3212`. Returns protocol equity and `imReq`/`mmReq`/`cmReq`, so Sidecar does not recompute requirements. |
| `getAccountEquity(account, { scope: "perps", marginBank, blockNumber })` | yes | Used by `readAccountAtBlock`. Throws if a held market is unpriceable. |
| `listPerpPositionAnalytics`, `getPerpPosition` | no | Head only. `readAccountAtBlock` says so explicitly instead of guessing. |
| `getOpenOrdersOnchain(pools, owner, { blockNumber })` | yes | At most 50 pools per call. |
| `getMaxPerpOrderSize`, `previewPerpOrderMargin`, `previewPerpLiquidationPrice` | report `asOfBlock` | The three preflight reads behind `quoteRoute`. |
| `getPerpSideHolders({ marginBank, pool, isLong })` | reports `asOfBlock` | Used only to find real accounts for read-only tests and the doctor. |

The indexer is history. Every risk input comes from the chain reads above; open orders fall
back to the indexer only when the chain read fails, and are then marked `source.kind: "indexer"`.

## autoPull decision

`PERPS.md:167-177`: pass `autoPull: true` when the transaction sender is the order owner. The pool
tops the in-bank balance up from the owner's wallet before it locks, and `msg.sender == order.owner`
is the pool's only gate (`dist/perp/margin.d.ts:1418-1430`). Sidecar always sends from the owner's
own wallet, so `quoteRoute` defaults `autoPull` to `true` and records the value on the quote.

Observed consequence: with `autoPull: true`, `limitedBy` can read `"walletAllowance"` even when the
account has plenty of margin in the bank. On the fork rehearsal, an account with 20 USDso unlocked
in the bank and a zero wallet allowance showed max size 0.00447 BTC limited by `walletAllowance`.
`PerpMaxOrderSizeLimit` documents `walletBalance` and `walletAllowance` as distinct fixes
(`dist/perp/margin.d.ts:1467-1490`); the UI should not collapse them.

## Liquidation price `0n` and `null`

`previewPerpLiquidationPrice` and `getLiquidationPrice` return a price "floored at 0 (a price cannot
go negative)", or `null` when the position is flat (`dist/perp/margin.d.ts:288`). So `0n` on a long
means no positive price of this market alone trips maintenance, and on a short it means maintenance
is already breached at any positive price. It is a single-market solve: other markets are held at
their current contribution (`dist/perp/margin.d.ts:276-281`). `interpretLiquidationPrice` maps this
to `unreachable` / `breached` / `flat` / `price`, and the UI must never render "liquidates at 0".

## Orders

- `trader.placePerpOrder` resolves only after mining (`dist/trade.d.ts:2747`). Sidecar uses
  `trader.buildPlacePerpOrder` (`dist/trade.d.ts:2945`) and sends through the wallet itself, so the
  hash is shown as SUBMITTED the moment the wallet returns it.
- `ORDER_TYPE`: LIMIT 0 (GTC), FILL_OR_KILL 1, MARKET 2 (IOC), POST_ONLY 3.
- The unsigned call has no gas field, so the 10,000,000 ceiling travels on `BuiltOrder.gas`.
  `DEFAULT_GAS` is 10M because "even an ERC-20 `approve` runs out of gas under a 1M limit" on Somnia,
  and the mempool admits a transaction only when the full ceiling times `maxFeePerGas` (60 gwei,
  `DEFAULT_FEES`) is funded: a 0.6 STT envelope per write (`dist/config.d.ts:310-326`). That is
  `MIN_GAS_BALANCE_FOR_ORDER_WEI`. The unused remainder is not charged.
- `decodePlaceOrder(receipt, pool?)` is pure and exported (`dist/decode/orders.d.ts:41`). Sidecar
  uses it for fills and reads resting state from `OrderRested`. Observed on recorded Hideki receipts:
  pools emit `OrderPlaced` for every placement, a fully filled IOC included, so an order id alone
  does not mean the order rests.
- A reverted transaction carries no reason in the receipt. `reconcileOrder` replays it with
  `eth_call` at the parent block and decodes with `decodeRevert`. On the fork this recovered
  `ImmediateOrCancelNoFill` for an IOC priced away from the book.
- On a reverted receipt the placement, position, credit and funding checks report `unknown`
  ("not applicable"), never `pass`. Only the receipt check decides REVERTED. `VerifiedOrder.requested`
  comes from the signed calldata only and is `null` when it does not decode as `placeOrder`.
- `getPerpFeedStatus` returns a raw `markPrice` even when the feed is down (often `0n`)
  (`dist/perp/state.d.ts:130`). Sidecar's `MarketFeedStatus.liveMarkPrice` is that mark only when
  `markPriceOk && markPrice > 0n`, else `null`. Render `live` / `liveMarkPrice`, never the raw mark.
- `TransactionOutcomeUnknownError` carries `{ chainId, hash? }` and `ContractRevertError` carries
  `errorName` (`dist/errors.d.ts:438`, `:497`).

## Margin deposits

- `trader.buildDepositMargin({ marginBank, amount, collateral, autoApprove, gas })` returns
  `UnsignedMarginDeposit { deposit, approval? }` (`dist/perp/margin.d.ts:860-901`).
- Its approval is always `maxUint256` and is built without reading the current allowance
  (`dist/perp/margin.d.ts:880-885`, verified by a unit test). Sidecar passes `autoApprove: false`
  and builds its own `approve(marginBank, amount)` for exactly the deposit amount, only when the
  allowance read at the build block is short. `encodeExactApproval` refuses `maxUint256`.
- `MarginBank.deposit(uint256 amount)` has no recipient argument (`marginBankWriteAbi`) and emits
  `Deposited(account indexed, amount)` (`marginBankEventsAbi`). It credits the caller, so a deposit
  from wallet B can only fund B's own margin account. `reconcileDeposit` checks that from the
  receipt: the sender, the target bank, the calldata amount, exactly one `Deposited` for the sender
  with that amount and none for anyone else, and one collateral `Transfer` of that amount from the
  sender to the bank. Only then is the outcome `CREDITED`.
- `sendMarginDeposit` waits for the approval receipt and re-reads the allowance at the approval's
  block before it sends the deposit. On the fork the full deposit consumed the exact allowance back
  to 0.

## Receipt waiting

viem's `waitForTransactionReceipt` (2.57.13) re-checks the receipt only when its block watcher emits
a new block number, and it skips an emission that arrives while its previous check is still running
(`node_modules/viem/actions/public/waitForTransactionReceipt.ts`, the `if (retrying) return` guard).
On an anvil fork, where one transaction mines one block and nothing else follows, that left a mined
order reported as a 60 s timeout (`docs/fork-rehearsal.md`). The adapter now polls
`eth_getTransactionReceipt` every 250 ms, bounds each request by the remaining deadline, returns
`success` / `reverted` from the receipt and `timeout` (or `error` when the last answered look failed)
otherwise, and never resends. The deadline defaults to 60 s, the SDK's own wallet-path deadline,
and is configurable with the `receiptTimeoutMs` adapter option or
`NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS`.

## Protocol facts seen on chain

- `getFundingParameters().maxOracleStalenessSec` is 5 on ETH-PERP: a pool stops pricing 5 s after
  its last index update. Live this is invisible; on a fork it means the clock must not advance.
- Hideki's RPC serves historical state, so `eth_getBalance`, ERC-20 reads and `getAccountEquity`
  pinned to a past block work.
- Explorer per-transaction pages are `https://explorer.testnet.somnia.network/tokyo/tx/<hash>`
  (confirmed by the organisers). The explorer's "Open in Markets" link 404s and it shows perp sizes
  as 0, so Sidecar never reads sizes from it.

## Where the original assumptions were wrong

- Collateral does not start in the MarginBank. Faucet USDso (100 per 24 h, plus 50 STT) lands in the
  wallet, so Sidecar needs its own deposit path, and its guidance never suggests moving funds into
  the dreamDEX app account or any smart wallet.
- `previewPerpOrderMargin` exists and returns the full lock breakdown (IM portion, adverse gap,
  leverage surcharge, fee headroom), so Sidecar shows the SDK's numbers instead of its own formula.
- `getMarginAccount` already returns protocol equity and the IM, MM and close-out requirements.
- There are 21 perp markets on the MarginBank, not a handful.
- Indexed market rows are strings, not bigints, by declared type.
- The perps collateral is the MarginBank's `collateralToken`, not the address bundle's `collateral`.
- Positions cannot be read at a past block through the SDK; only equity, open orders and wallet
  balances can.

## Measured latencies

Measured on 2026-11-01 at 07:14 UTC from a macOS laptop over the public
`wss://api.hideki2.infra.testnet.somnia.network/ws` endpoint, through `lib/dreamdex/timing.ts`.
10 rounds of `getChainStatus`, `getMarketHealth(BTC)`, `getAccountSnapshot` and `quoteRoute`
for a real ETH holder, after one `getMarketListing`. No failures. Milliseconds.

| Operation | n | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `adapter.getMarketListing` | 1 | 5380 | 5380 | 5380 |
| `adapter.getChainStatus` | 10 | 388 | 430 | 430 |
| `adapter.getMarketHealth` | 10 | 801 | 1170 | 1170 |
| `adapter.getAccountSnapshot` | 10 | 1274 | 1445 | 1445 |
| `adapter.quoteRoute` | 10 | 1618 | 2262 | 2262 |
| `eth_blockNumber` | 30 | 392 | 452 | 480 |
| `getMarginAccount` | 10 | 450 | 781 | 781 |
| `listPerpPositionAnalytics` | 10 | 868 | 1048 | 1048 |
| `getPerpVoucher` | 10 | 861 | 952 | 952 |
| `getOpenOrdersOnchain` | 10 | 442 | 780 | 780 |
| `getPerpHealthSnapshot` | 10 | 399 | 480 | 480 |
| `getPerpFeedStatus` | 10 | 801 | 1169 | 1169 |
| `getMaxPerpOrderSize` | 10 | 1617 | 2262 | 2262 |
| `previewPerpOrderMargin` | 10 | 1617 | 2262 | 2262 |
| `previewPerpLiquidationPrice` | 10 | 1230 | 1346 | 1346 |
| `listPerpMarkets` (indexer) | 1 | 1963 | 1963 | 1963 |
| `listPerpPoolStatuses` | 1 | 1203 | 1203 | 1203 |
| `getPerpSystemConfig` | 1 | 2210 | 2210 | 2210 |

The three preflight reads in `quoteRoute` run in parallel on one socket, so their timings overlap
and the quote's wall time is close to the slowest of them. No live write latency is recorded here.
Gas used by Sidecar's live run is in `SPONSOR_BEHAVIOUR.md`. Fork receipt times in
`docs/fork-rehearsal.md` measure anvil, not Somnia.
