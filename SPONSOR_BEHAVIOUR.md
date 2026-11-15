# Protocol behaviour seen while building Sidecar

What dreamDEX perps on Somnia Hideki did when Sidecar used them, through `@somnia-chain/markets-sdk` 0.32.1. Each item comes from a live read, a test in this repo, or the local fork rehearsal, and says which.

## Orders and gas

- A perp order needs the sender to hold `10,000,000 gas × maxFeePerGas` in STT before the node accepts it, about 0.6 STT at current fees. The gas actually charged is far lower: the fork rehearsal's BTC IOC fill used 756,115 gas, and a live BTC fill (`0xa71faaf7…7259`, not sent by Sidecar) used 1,620,429 gas for 0.009722 STT. Sidecar blocks signing below 0.6 STT and explains the gap. (Live read and fork.)
- An immediate-or-cancel order with nothing to fill reverts with `ImmediateOrCancelNoFill`, and the reason decodes from the revert data. (Fork.)
- Pools stop pricing 5 seconds after their last index update (`maxOracleStalenessSec` is 5 on ETH-PERP). Live this never showed, but a fork has to keep its clock still. (Live read and fork.)

## Collateral

- Faucet USDso lands in the wallet, not in the MarginBank, so an app has to offer its own deposit. `MarginBank.deposit(uint256)` credits only `msg.sender`. (Live read and fork.)
- The SDK's `buildDepositMargin` always builds an unlimited (`maxUint256`) approval. Sidecar encodes an exact-amount approval itself. An option to pass the approval amount would let apps avoid that. (Unit test against the SDK.)
- With `autoPull` on, the order preview can report the limit as `walletAllowance` even when the MarginBank already holds enough, so "approve more" and "deposit more" need different guidance. On the fork, an account with 20 USDso unlocked in the bank and no wallet allowance showed a max size of 0.00447 BTC limited by `walletAllowance`. (Fork.)

## Reads

- `previewPerpOrderMargin`, `getMaxPerpOrderSize` and `getMarginAccount` give the full margin picture (lock breakdown, IM, MM, close-out), so Sidecar doesn't need its own formula. (Live read.)
- Equity, open orders and wallet balances can be read at a past block. Positions can't be read through the SDK at a past block. (Live read.)
- The MarginBank listed 21 perp markets, all tradeable, on 2026-11-01. By 2026-11-15 the indexer listed 60 on the same MarginBank, including test and load-test pools the gates mark as not tradeable. (Live reads, `npm run doctor`.)
- `listPerpMarkets()` returns 50 rows by default, newest first, and doesn't say when it truncated. Once 60 markets were listed, BTC and ETH dropped off the default page. Sidecar now asks for up to 500. (Live read, 2026-11-15.)
- Indexed market rows type their numbers as strings, not bigints. (SDK types.)

## Explorer

- Transaction pages are `https://explorer.testnet.somnia.network/tokyo/tx/<hash>`. The explorer shows perp order sizes as 0, and its "Open in Markets" link returns 404. Sidecar reads sizes from the receipt instead.

## Receipts

- viem's `waitForTransactionReceipt` only re-checks on new block notifications and skips blocks that arrive mid-check. On the fork this missed receipts for minutes. Sidecar polls `eth_getTransactionReceipt` every 250 ms up to a deadline instead. (Fork.)

## Measured read latency

Measured 2026-11-01 07:14 UTC from a laptop over the public websocket endpoint, 10 rounds each, no failures. Milliseconds.

| Operation | n | p50 | p95 |
| --- | --- | --- | --- |
| Chain status | 10 | 388 | 430 |
| Market health (BTC) | 10 | 801 | 1170 |
| Account snapshot | 10 | 1274 | 1445 |
| Route quote (margin preview + max size) | 10 | 1618 | 2262 |
| `getMarginAccount` | 10 | 450 | 781 |
| `previewPerpOrderMargin` | 10 | 1617 | 2262 |
| `getMaxPerpOrderSize` | 10 | 1617 | 2262 |
| Market listing (first load) | 1 | 5380 | 5380 |

The full table is in `docs/sdk-notes.md`. Fork receipt times measure anvil, not Somnia, and are left out.

## Live writes

Six transactions sent through Sidecar's trade screen on 2026-11-03, read back from their receipts. Every one was sent with the 10,000,000 gas limit Sidecar uses.

| Transaction | Gas used | Fee paid |
| --- | --- | --- |
| USDso approve (exact amount), A and B | 260,601 | 0.001563606 STT |
| MarginBank deposit of 20 USDso, A and B | 521,297 | 0.003127782 STT |
| ETH-PERP IOC long 0.004, A (`0x910d0e21…16bc`) | 3,055,977 | 0.018335862 STT |
| BTC-PERP IOC long 0.00013, B (`0x518c5317…e73c`) | 2,146,986 | 0.012881916 STT |

So a perp order used 21% to 31% of the 10M limit while the node asked for the full limit's worth (about 0.6 STT) up front. No timing is given for send to receipt, because these runs did not record one.
