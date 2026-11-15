# Sidecar

Sidecar shows the same perp order placed two ways, side by side: in your current margin account, where it shares collateral with your open positions, or in a second wallet with its own margin. You pick one, review it, sign it, and Sidecar checks the result against the chain receipt.

It runs on the Somnia Hideki testnet against dreamDEX perps. Testnet funds only.

## Quick start

Requires Node 22 or later.

```bash
npm install
npm run doctor   # read-only check that the RPC, websocket, indexer and markets respond
npm run dev      # http://localhost:3000
```

No environment variables are needed. `.env.example` lists the optional overrides.

Pages:

- `/` is the landing page: why separate margin matters, how the comparison works, every listed market read live, Sidecar's own recorded runs, the receipt checks and the funding steps.
- `/start` is a funding checklist for a fresh wallet: network, faucet, gas, USDso and margin, each read live from the connected wallet. It only reads.
- `/trade` is the trade screen: accounts, positions, the order ticket, the shared-or-separate comparison, review and signing.
- `/receipt` opens any Hideki transaction by hash and lists the recorded runs.
- `/receipt/<txHash>` is a receipt for any perp order transaction, decoded from the chain receipt, with truth checks and account state before and after.
- `/proof` shows the three runs of the live demo (shared margin in A, separate margin in B, A unchanged by B's trade) from `public/proof/index.json`, re-reads the chain from the browser on demand, and opens any Hideki receipt by hash.

## Network and SDK

| | |
| --- | --- |
| Chain | Somnia Hideki testnet, chain id 50383 |
| RPC | `https://api.hideki2.infra.testnet.somnia.network` |
| Websocket | `wss://api.hideki2.infra.testnet.somnia.network/ws` |
| Indexer | `https://hideki-dev.smk.somnia.host/v1/graphql` |
| Explorer | `https://explorer.testnet.somnia.network/tokyo/tx/<hash>` |
| MarginBank | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| Collateral (USDso) | `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` |
| SDK | `@somnia-chain/markets-sdk` 0.32.1 |

Every figure on the trade screen carries its source: `CHAIN` for a direct contract read, `SDK` for an SDK computation over chain state, `INDEXED` for indexer data, `EST` for arithmetic Sidecar does on top of those, and `SCENARIO` for the hypothetical price-move panel. Scenario figures never feed the comparison or the order. Anything that could not be read shows as Unavailable, never as zero.

Margin requirements and order sizing come from the protocol's own preview calls (`previewPerpOrderMargin`, `getMaxPerpOrderSize`, `getMarginAccount`). Sidecar does not use its own margin formula. `docs/sdk-notes.md` covers the calls used, the assumptions that turned out wrong, and measured read latencies.

## How an order is checked

After a transaction is mined, Sidecar decodes the receipt and runs these checks:

1. The transaction is on Hideki (50383).
2. It was sent by the account selected in the comparison.
3. The target is a listed perp market.
4. That market settles on the expected MarginBank.
5. The receipt reports success.
6. The order id and fills decode from the receipt and belong to the sender.
7. The calldata matches the order Sidecar prepared before signing.
8. The position change belongs to the sender.
9. No other account's collateral was locked.
10. The other account in the comparison did not fund the trade.

A check Sidecar cannot run is shown as "Not compared", never as a pass. The receipt is stamped VERIFIED only when every shown check passes. Filled sizes come from the receipt, never from the explorer, which shows perp sizes as 0.

If no receipt arrives before the deadline (60 s by default), the order shows "Outcome unknown" and the ticket stays locked. Sidecar keeps polling the same hash and never resends on its own.

## Live evidence

Recorded on 2026-11-03 on Somnia Hideki (chain 50383). Every transaction below was built, signed and sent through Sidecar's own trade screen, then recorded with `npm run evidence:capture`. The records are in `public/proof/` and shown on `/proof`.

| Journey | Account | Transaction | Result |
| --- | --- | --- | --- |
| Fund A's own margin (exact approval, then deposit) | A `0xeD4267c10535B54283E3db2644F7585d015100db` | [`0x780e8f4e…c492`](https://explorer.testnet.somnia.network/tokyo/tx/0x780e8f4e26f2132272c5e0baf19037a7aa5979c1dfb824d88ad09b56ca94c492) | Credited 20 USDso, 7 of 7 deposit checks |
| Shared margin: ETH order in account A | A `0xeD4267c10535B54283E3db2644F7585d015100db` | [`0x910d0e21…16bc`](https://explorer.testnet.somnia.network/tokyo/tx/0x910d0e21c09e6d3e908fb36b7071e09b7d97a84067ac839a480493914f7416bc) | Filled 0.004 ETH, block 40,831,547 |
| Fund B's own margin (exact approval, then deposit) | B `0xcC7F72954b83B51263De70d6e4011E595A144b3F` | [`0x7e7d7e2b…8ac6`](https://explorer.testnet.somnia.network/tokyo/tx/0x7e7d7e2b3d57aa22d22f8fdbb700ba7f9fbf296eb7b1bd6516658c12936d8ac6) | Credited 20 USDso, 7 of 7 deposit checks |
| Separate margin: BTC order in account B | B `0xcC7F72954b83B51263De70d6e4011E595A144b3F` | [`0x518c5317…e73c`](https://explorer.testnet.somnia.network/tokyo/tx/0x518c5317a21901191d085a03fe02e99184e787433cb14dc422670ee3d546e73c) | Filled 0.00013 BTC, block 40,833,611 |
| A unchanged by B's trade | A, read at blocks 40,833,610 and 40,833,611 | same as above | A's equity 20.002892838215857570 USDso at both blocks, no lock, no open orders |

Each order passed 10 of 10 truth checks in the browser that sent it. The captured records show 9 passes and "Calldata matches the intended order" as not compared, because the order Sidecar prepared before signing only exists in that browser.

A local fork rehearsal of the same flow is written up in `docs/fork-rehearsal.md`. It ran on an anvil fork of Hideki and is not on-chain evidence.

## Funding and the live run

Sidecar never asks for a seed phrase or private key. Signing happens in your browser wallet.

1. Create two ordinary wallet accounts (EOAs) in a browser wallet, A and B. Use fresh testnet accounts. Don't use, and never send funds to, a dreamDEX app account or any smart wallet.
2. Add Somnia Hideki (chain id 50383, RPC above). Sidecar also offers a "Switch to Hideki" button once a wallet is connected.
3. Claim faucet funds for each address in the dreamDEX builder Telegram group: `/faucet 0xYourAddress` to the faucet bot. Each claim gives 50 STT and 100 USDso, once per 24 hours. If only A can claim, send B part of A's STT and USDso with a normal wallet transfer.
4. Each account needs at least 0.6 STT before placing a perp order. The node requires `10,000,000 gas × max fee` up front, even though the gas actually spent is far lower.
5. Open `/trade`, connect A, and add B as the second wallet.
6. Enter the order. When an account's margin can't cover it, its card shows a "Fund account" panel. With that account connected in the wallet, press "Fund this account's margin". Sidecar approves exactly the deposit amount, not an unlimited allowance, then calls `MarginBank.deposit`, which credits only the sending wallet. Confirm both steps in the wallet and wait for "credited".
7. With A connected, choose "Share with my current positions" for an ETH order, review it and sign.
8. Switch the wallet to B, choose "Give this trade its own margin" for a BTC order, review it and sign.
9. Record each confirmed transaction:

   ```bash
   npm run evidence:capture -- --tx 0x<hash> --selected 0x<sender> --account-a 0x<A> --account-b 0x<B>
   ```

   This writes a record under `public/proof/` and updates `public/proof/index.json`, which `/proof` reads. The script refuses to write there unless it is reading the real Hideki chain.

### Recording a run

`/proof` only counts a run when `public/proof/index.json` holds a captured record for it. After a real order mines on Hideki, run `npm run evidence:capture` with the hash and all three accounts (`--selected`, `--account-a`, `--account-b`). The script re-reads the receipt and both accounts from the chain and refuses a local or forked node. Without `--selected` and both compared accounts the record is still listed, but it can't count for any of the three runs.

Each run needs an order that filled or rested, with no failed check.

- Shared margin: an ETH-PERP order sent from A.
- Separate margin: a BTC-PERP order sent from B.
- A unchanged: an order from B whose "the other account's collateral did not fund this trade" check passed.

Read timings measured in a browser tab aren't shown on the page any more. They're still in the JSON the page downloads, and measured latencies are in `docs/sdk-notes.md`.

`npm run smoke:order` builds and previews an order from the command line without sending anything. `--execute` needs `SIDECAR_SMOKE_PRIVATE_KEY` in `.env.local` and is meant for a throwaway testnet key only.

## Tests

```bash
npm run typecheck          # next typegen + tsc
npm run lint               # eslint
npm test                   # unit and UI tests (vitest, jsdom)
npm run test:integration   # live read-only tests against Hideki
npm run test:e2e           # Playwright, desktop and mobile, against live Hideki reads
npm run build
npm run verify             # typecheck, lint, unit and build in one go
```

Integration and end-to-end tests read the live testnet and send nothing. End-to-end tests use an injected mock wallet that rejects signatures or returns a hash that doesn't exist on chain. They find funded accounts to read from at run time, so they need network access and take several minutes. Two integration tests skip unless given a confirmed order hash (`SIDECAR_TEST_TX`) or an account without full market access.

## Limitations

- Positions can't be read at a past block through the SDK, so the receipt page reads equity, open orders and balances at the blocks before and after, and takes the position after from the receipt's own event.
- The receipt is VERIFIED only in the browser that sent the order, because only that browser has the order Sidecar prepared before signing. Elsewhere it shows "Receipt checks pass" and names what was not compared.
- A wallet speed-up or cancel shows as "Outcome unknown" until a receipt for a tracked hash arrives.
- Saved accounts and in-flight orders live in this browser's localStorage. They hold addresses and labels, never keys.
- Sidecar connects to browser wallets that announce themselves through EIP-6963, such as MetaMask or Rabby. There's no WalletConnect yet, so a phone without a wallet browser can read every page but can't sign.
- Testnet only. Sidecar is not built or reviewed for mainnet funds.

## Project layout

| Path | What lives there |
| --- | --- |
| `app/` | Routes: landing, `/start`, `/trade`, `/receipt`, `/receipt/[txHash]`, `/proof`, and the development-only `/dev/styleguide` |
| `components/chrome/` | The header, network status and footer every page shares |
| `components/ui/` | Design system primitives, documented in `docs/design-system.md` |
| `components/trade/`, `components/evidence/`, `components/landing/`, `components/start/` | Screens and their parts |
| `hooks/` | Client state: wallet, account book, quotes, execution, receipt reconciliation |
| `lib/dreamdex/` | The adapter over the SDK, RPC and indexer: config, reads, deposits, receipt decoding and error mapping |
| `lib/risk/`, `lib/orders/` | The shared-or-separate comparison, order validation and the order lifecycle |
| `scripts/` | `doctor`, `smoke:order` and `evidence:capture` |
| `tests/` | Unit and UI (vitest), live integration, and Playwright end-to-end |

## License

MIT. See [LICENSE](LICENSE).

## X posts

Posts about the build tag @DreamDEXSomnia. Links are added here once published.

- Launch post: not yet published
- Live run with receipts: not yet published
