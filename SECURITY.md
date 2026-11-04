# Security

Sidecar is a testnet app. It runs against dreamDEX perps on the Somnia Hideki testnet and has not been built or reviewed for mainnet funds.

## How Sidecar handles keys

- The web app never asks for a seed phrase or a private key. Every transaction is signed in the user's own browser wallet.
- Saved accounts in `localStorage` hold addresses and labels only.
- The only scripts that can sign are `npm run smoke:order -- --execute`, which reads `SIDECAR_SMOKE_PRIVATE_KEY` from `.env.local`. Git ignores every `.env*` file except `.env.example`. Use a throwaway testnet key there and nothing else.
- `npm run evidence:capture` only reads the chain and refuses to write records from a local or forked node.

## What Sidecar checks before signing

- The order preview is refreshed for the exact account that will sign, and Sidecar refuses to sign a preview older than 15 seconds.
- Collateral approvals are for the exact deposit amount, never an unlimited allowance.
- After mining, the receipt is checked against the order Sidecar prepared. A check it can't run shows as "Not compared", never as a pass.

## Reporting a problem

Open a private security advisory on this repository (Security, then "Report a vulnerability") rather than a public issue. Include the page, the steps, and a transaction hash if one is involved. Never include a private key or seed phrase in a report.
