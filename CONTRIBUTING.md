# Contributing

## Setup

Node 22 or later.

```bash
npm install
npm run doctor   # checks the RPC, websocket, indexer and markets respond
npm run dev
```

## Before opening a pull request

```bash
npm run verify             # typecheck, lint, unit and UI tests, production build
npm run test:integration   # live read-only tests against Hideki
npm run test:e2e           # Playwright, desktop and mobile
```

The integration and end-to-end suites read the live testnet, so they need network access and take a few minutes. Neither sends a transaction.

## Conventions

- Files are kebab-case. Exports are named, and exported functions have explicit return types.
- No `any`, `@ts-ignore` or `@ts-expect-error`. No empty `catch` blocks.
- Comments explain why, not what.
- Tests read as given, when, then: `#given` sets up state, `#when` acts, `#then` asserts.
- Every figure on screen carries its source (`CHAIN`, `SDK`, `INDEXED`, `EST` or `SCENARIO`). A value that couldn't be read renders as Unavailable, never as zero.
- Margin numbers come from the protocol's preview calls. Don't add a local margin formula.
- UI work goes through the primitives in `components/ui/` and the tokens in `app/globals.css`. `docs/design-system.md` covers both, and `/dev/styleguide` renders them in development.

## Commits

Short imperative subject with a scope, for example `trade: lock the ticket while a receipt is pending`. The body, when there is one, says why.

## Keys

Never commit a private key, seed phrase or funded account secret. `.env.local` is ignored for that reason. See [SECURITY.md](SECURITY.md).
