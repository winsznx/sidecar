# Local fork rehearsal (not on-chain evidence)

Everything in this document happened on a private anvil fork of Somnia Hideki running on
`127.0.0.1:8645`. None of these transactions exist on the live chain. Every hash below is
**fork-only**: it will not resolve on the explorer, and nothing here may be shown as proof
that Sidecar placed an order on dreamDEX. Live evidence comes only from transactions
reconciled against `https://api.hideki2.infra.testnet.somnia.network`.

The point of the rehearsal was to drive the real Sidecar code paths (the adapter, the
`smoke:order` script, `evidence:capture`) end to end against real Hideki contract state,
with two fresh addresses that hold no real funds.

## Setup

| Item | Value |
| --- | --- |
| Date | 2026-11-01 (UTC) |
| Tool | anvil 1.7.1, `anvil --fork-url <Hideki RPC> --fork-block-number 38632729 --port 8645` |
| Fork block | 38632729, timestamp 1793516552 (2026-11-01 07:02:32 UTC) |
| Chain id on the fork | 50383 (inherited from the fork) |
| Account A (fork-only) | `0xD2233BFFe250929e3358c92ebCECe23C8ecE10b8`, a freshly generated address |
| Account B (fork-only) | `0xC309D967d9F3deeC53535115e1Ceb77Cc127be9F`, a freshly generated address |
| MarginBank | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| Collateral | USDso `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`, read from the market's quote token |

Fork-only state edits, all through anvil cheat methods:

1. `anvil_setBlockTimestampInterval 0`, so every fork block keeps the fork block's timestamp
   (why: see "What failed" below).
2. `anvil_impersonateAccount` for A, B and one real USDso-holding EOA
   (`0xFe6D21ac7e6E6e53c892a7521DD2deBA439f0837`), and `anvil_setBalance` of 10 STT each for gas.
3. The impersonated holder transferred 60 USDso to A and to B on the fork (58,553 gas each).
   This mirrors the faucet reality: collateral arrives in the wallet, not in the MarginBank.
   The original plan claimed the one-time perps voucher on the fork for each account after checking
   `getPerpVoucherEligibility`. That step was deliberately replaced with wallet-funded USDso plus the
   new deposit path, because bounty wallets are funded by the faucet's USDso in the wallet, and voucher
   (paper) collateral can only increase positions in allowlisted markets. The eligibility read was not
   run on the fork, so this rehearsal says nothing about voucher behaviour.
   No private key was used anywhere. Both accounts sent through anvil impersonation
   (`smoke:order --impersonate`, which refuses any non-loopback RPC).

The fork was warmed with five `npm run doctor -- --rpc http://127.0.0.1:8645 --ws ws://127.0.0.1:8645`
runs and three preview-only `smoke:order` runs per account before anything was sent. A cold
fork fetches every storage slot from the remote RPC, and the first preview timed out on the
SDK's socket request deadline.

## What ran, in order

### (a) A funds its own margin and opens a small ETH long

`npm run smoke:order -- --impersonate A --market ETH --side long --tif IOC --deposit 20 --counterpart B --timeout 600000 --execute`

Deposit (new `buildMarginDeposit` / `sendMarginDeposit` / `reconcileDeposit` path):

- Build at block 38632731: wallet 60 USDso, allowance to the bank 0, so an approval was needed.
- Approval `approve(MarginBank, 20000000000000000000)`: exactly the deposit amount, never unlimited.
  Fork-only hash `0x5f4b70c87e895f27e38a6a887cf68804ee0e76f92ad5dcd92af72a1abd676673`, 53,425 gas.
  The deposit was sent only after this receipt came back successful.
- Deposit `deposit(20000000000000000000)`, fork-only hash
  `0x1666edbf00f437370831713ae8f35d518f88b3aead47adabc89c763fae4b7567`, block 38632733, 111,090 gas.
- `reconcileDeposit`: **CREDITED**, 7 of 7 checks PASS (chain id, sender is A, target is the
  MarginBank, calldata is `deposit(uint256)`, receipt success, the bank's `Deposited` event credits
  A with 20 USDso and nobody else, the token `Transfer` of 20 USDso came from A's own wallet).

Order:

- Intent: long 0.004 ETH-PERP IOC, limit 2278.62 USDso. Preview at block 38632733: lock 0.5050 USDso,
  sufficient, projected liquidation "unreachable" (the SDK's `0n`, see `docs/sdk-notes.md`).
- Fork-only hash `0x6f343e11b9466770ef8b3fdecb04760570c6dc4efdee0855023c6ac17df63f92`, block 38632734,
  2,596,453 gas.
- **The receipt wait reached a decoded outcome.** It took 259,513 ms because anvil itself
  needed that long to mine the transaction from cold remote state; the anvil log shows 387
  `eth_getTransactionReceipt` polls between the send and the block being mined, and the
  receipt was picked up on the first poll after it.
- Outcome **FILLED**: 0.004 of 0.004 filled in one fill, entry 2267.28. 10 of 10 truth checks PASS,
  including "Calldata matches the intended order" and "The other account's collateral did not fund
  this trade" (no MarginBank event in the transaction names B).

### (b) B funds its own margin

Same command shape for B on BTC with `--deposit 20 --counterpart A`.

- Build at block 38632734: wallet 60 USDso, allowance 0.
- Exact approval, fork-only hash `0xd3cc214dab6341422b2c482bb1b1d62552d692c4ebe41f03204798753646edea`, 53,425 gas.
- Deposit, fork-only hash `0x405423a56db28e902650d29d72063e6743594bc7b8c6c3bfacedcf2f7a3c5835`,
  block 38632736, 111,090 gas.
- `reconcileDeposit`: **CREDITED**, 7 of 7 checks PASS; credited 20, transferred 20, sender B.

### (c) B places a small BTC IOC that fills

- Intent: long 0.00013 BTC-PERP IOC, limit 78427.2 USDso. Preview at block 38632736: lock 0.5807 USDso,
  sufficient.
- Fork-only hash `0x82390a9e00e52da00e8a09089b853600806d0a2166282b82ed8629229b67bed3`, block 38632737,
  756,115 gas, receipt after 34,337 ms (again anvil mining time).
- Outcome **FILLED**: 13000 of 13000 raw units, entry 78037. 10 of 10 truth checks PASS, including
  sender is B and "No MarginBank event in this transaction names A".

### (d) Verification by reads

Both accounts were read through the adapter before B's flow (head 38632734) and after it
(head 38632737), with `getMarginAccount` at head plus `readAccountAtBlock` pinned to each block.

| | A before (38632734) | A after (38632737) | B before (38632734) | B after (38632737) |
| --- | --- | --- | --- | --- |
| MarginBank unlocked | 20 | 20 | 0 | 20 |
| MarginBank locked | 0 | 0 | 0 | 0 |
| Equity (pinned `getAccountEquity`) | 19.996129848492834 | 19.996129848492834 | 0 | 19.979774428370536085 |
| Positions | ETH long 0.004 @ 2267.28 | unchanged | none | BTC long 0.00013 @ 78037 |
| Wallet USDso / allowance to bank | 40 / 0 | 40 / 0 | 60 / 0 | 40 / 0 |

- The BTC order's sender is B (truth check and raw `tx.from`).
- B's position and margin changed; B's allowance is back to 0, so the exact approval was consumed in full.
- A's MarginBank account, equity, position and wallet are byte-for-byte identical across the two
  pinned blocks. A's collateral did not fund B's trade.
- Locked collateral read 0 for both accounts after their IOC fills; the open positions are visible in
  the position reads and in each account's active-pool list, not as locked collateral.

### (e) Evidence capture into a scratch directory

`npm run evidence:capture -- --tx <hash> --account-a A --account-b B --rpc http://127.0.0.1:8645 --ws ws://127.0.0.1:8645 --out-dir <scratchpad>/fork-proof`
wrote one JSON record per order outside the repository. Both read FILLED with 9 PASS and
"Calldata matches the intended order" UNKNOWN, which is correct: evidence capture has no local
intent to compare against. That run predates the `--selected` flag: its "Sent by the selected
account" PASS compared the sender with itself and proved nothing. `evidence:capture` now takes
`--selected <account>` and fails that check when someone else sent the transaction, or reports it
UNKNOWN when no account is named.

`evidence:capture` refuses to write anywhere under `public/proof` when the RPC, WebSocket or indexer
URL is a loopback host (the SDK reads chain state over the WebSocket, so an HTTP-only test would miss
a `--ws` fork), and also when the default Hideki RPC does not confirm the mined block's hash. Each
record names the WebSocket and indexer it read from and the block-hash comparison.

### Extra: the revert path

B sent a long BTC IOC limited at 60000 USDso, far below the book. Fork-only hash
`0x5916868c0b369f0bb5651362fdc335acc695e361b8541adcbeebe338cc9f1738`, block 38632738, 73,956 gas,
receipt status 0. `reconcileOrder` replayed it with `eth_call` at the parent block and decoded
**ImmediateOrCancelNoFill**; outcome REVERTED, B's state unchanged.

### Receipt deadline check

`waitForReceipt` with `receiptTimeoutMs: 1500` on an unknown hash returned `timeout` after
1,618 ms (the last poll is allowed to finish), and on the mined BTC hash returned `success` in 1 ms.

## What failed, and why

1. **Receipt wait timed out on an earlier fork run** (fork block 38411916, same session).
   A's ETH IOC was submitted and the script reported UNKNOWN_OUTCOME after 60 s, although
   the transaction had mined in block 38411917. The adapter then used viem's
   `waitForTransactionReceipt`, which re-checks only when its block watcher emits a new block
   number, and skips an emission that arrives while its previous check is still running. That check
   was a replacement scan (the `eth_getBlockByNumber` in the anvil log right before the block
   was mined), which on a fork is answered from the remote RPC.
   anvil mined the one block during that check and then mined nothing else, so no further
   block was ever emitted and the receipt was never fetched again. The anvil log shows 235
   `eth_blockNumber` polls after mining and no further receipt request. The adapter now polls
   `eth_getTransactionReceipt` on a fixed 250 ms interval with each request bounded by the
   remaining deadline. That is independent of block cadence, so it behaves the same on the
   live chain, and it never resends.
2. **Markets went unpriceable after a few fork blocks** (attempt at fork block 38630162).
   The pools refuse to price when the index is older than `maxOracleStalenessSec`, which is 5 s
   on ETH-PERP (`getFundingParameters`). Oracle updates do not arrive on a fork, and with a 1 s
   block timestamp interval the index was stale by the fifth block. A's deposit in that attempt
   was CREDITED (7 of 7), and the ETH order was then refused by Sidecar's own preflight
   ("The market is not priceable right now") without being sent. Holding the timestamp with
   `anvil_setBlockTimestampInterval 0` fixed it for the run above.
3. **The doctor's WebSocket new-head check fails on the fork.** anvil mines only on demand, so
   no head arrives within 5 s. This is expected and non-critical.

## What differs on the live chain

- No impersonation: the wallet signs. Funds come from the faucet (50 STT and 100 USDso per 24 h
  into the wallet). Sidecar's deposit path moves USDso from a wallet into that same wallet's own
  MarginBank account only.
- Oracle and funding updates arrive continuously, so markets stay priceable without any clock tricks,
  and mark prices, fills and entry prices will differ from the fork's frozen book.
- Gas: anvil charges Ethereum's gas schedule, not Somnia's, so the gas figures above (53,425 per
  approval, 111,090 per deposit, 0.76M to 2.6M per order) and the fork's fees are not a
  prediction of live costs. Live perp orders have been observed at 0.0003 to 0.003 STT.
- Receipt latency: live blocks are fast and the RPC already holds the state, so receipts are
  expected within seconds; the minutes seen here were anvil fetching cold remote state.
- The explorer link printed for each fork hash will 404. On the live chain the format
  `https://explorer.testnet.somnia.network/tokyo/tx/<hash>` is the confirmed per-transaction page.
