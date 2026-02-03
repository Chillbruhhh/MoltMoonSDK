---
name: moltmoon_sdk_operator
description: Operational playbook for AI agents using @moltmoon/sdk to launch tokens, fetch market data, and execute buy/sell actions safely on Base mainnet.
---

# MoltMoon SDK Operator Skill

Use this skill whenever an agent needs to interact with MoltMoon through the SDK or CLI.

## Scope

This skill covers:

- Launching tokens with seed liquidity
- Launch metadata population (social links + image)
- Reading token/market/quote data
- Buying and selling through market intents
- Safe network + wallet configuration
- Operator runbooks for production

This skill does not cover:

- Contract deployment/migrations
- Backend API deployment
- Wallet generation or custody policy design

## Prerequisites

- Node.js 20+
- Access to MoltMoon API (`MOLTMOON_API_URL`)
- Signer wallet funded for selected network
- USDC for seed/buys where applicable
- Private key in secure environment variable

Recommended env:

```env
MOLTMOON_API_URL=https://api.moltmoon.xyz
MOLTMOON_NETWORK=base
MOLTMOON_PRIVATE_KEY=0x...
```

## Decision Guide

1. Need read-only market intel? Use `tokens`, `quote-buy`, `quote-sell` or read methods.
2. Need to launch/trade? Ensure private key is loaded and network is correct.
3. Unsure about price impact? Always quote first, then execute.
4. Live launch? Run full preflight checklist before first transaction.
5. Launch image involved? Run `--dry-run` first to validate dimensions/format.

## SDK Workflow

### 1) Initialize client

```ts
import { MoltmoonSDK } from '@moltmoon/sdk';

const sdk = new MoltmoonSDK({
  baseUrl: process.env.MOLTMOON_API_URL || 'https://api.moltmoon.xyz',
  network: 'base',
  privateKey: process.env.MOLTMOON_PRIVATE_KEY as `0x${string}`
});
```

### 2) Validate market context

```ts
const tokens = await sdk.getTokens();
const quote = await sdk.getQuoteBuy('<market>', '10');
```

### 3) Execute write action

```ts
const launch = await sdk.launchToken({
  name: 'Token',
  symbol: 'TKN',
  description: 'Agent token',
  seedAmount: '10'
});
```

## CLI Runbooks

### Read-only preflight

```bash
npx mltl tokens --json
npx mltl quote-buy --market 0xMARKET --usdc 10 --json
```

### Launch token

```bash
npx mltl launch \
  --name "Agent Token" \
  --symbol "AGT" \
  --description "Agent launch" \
  --website "https://agent.xyz" \
  --twitter "https://x.com/agent" \
  --telegram "https://t.me/agent" \
  --discord "https://discord.gg/agent" \
  --image "./assets/logo.png" \
  --seed 10 \
  --network base \
  --json
```

### Dry-run launch validation (no tx)

```bash
npx mltl launch \
  --name "Agent Token" \
  --symbol "AGT" \
  --description "Agent launch" \
  --seed 10 \
  --dry-run \
  --json
```

### Buy and sell

```bash
npx mltl buy --market 0xMARKET --usdc 5 --slippage 500 --json
npx mltl sell --market 0xMARKET --token 0xTOKEN --amount 100 --slippage 500 --json
```

## Production Safety Checklist

Before any production write action:

- Confirm `MOLTMOON_NETWORK=base`
- Confirm API URL points to production domain
- Confirm signer address and balances (ETH gas + USDC)
- Confirm treasury/admin multisig addresses are final (not dry-run)
- Run quote to verify expected output and fees
- Record tx hashes and addresses in deployment log

## Common Failure Modes

- `transfer amount exceeds allowance`
  - Cause: approval missing/insufficient
  - Fix: execute approval intent path first (SDK handles automatically in buy/sell/launch flow)

- `transfer amount exceeds balance`
  - Cause: signer lacks tokens/USDC
  - Fix: fund signer wallet on correct chain

- `not owner`
  - Cause: signer lacks ownership permissions
  - Fix: transfer ownership or execute from owner/multisig

- `ERR_NAME_NOT_RESOLVED`
  - Cause: API DNS not propagated/misconfigured
  - Fix: verify DNS A/CNAME and server ingress target

- `Unsupported image format` / image validation errors
  - Cause: non-PNG/JPEG file, too large, bad dimensions, or non-square-ish logo
  - Fix: use PNG/JPEG, <=500KB (<=100KB recommended), square dimensions in 512-2048 px range

- `private key too short`
  - Cause: malformed key
  - Fix: 32-byte hex with `0x` prefix

## Operational Policy

- Never print private keys in logs.
- Never commit `.env`.
- Use dedicated hot wallet for tx execution; hold treasury in multisig.
- Use `--dry-run` for non-broadcast validation before production writes.

## Expected JSON Shapes

Successful command output:

```json
{
  "success": true
}
```

Error output:

```json
{
  "success": false,
  "error": "human-readable message"
}
```

## Release Workflow (for maintainers)

```bash
cd sdk
npm run build
npm version patch
npm publish --access public
```

After publish, verify:

```bash
npx mltl --help
```
