# @moltmoon/sdk

Official TypeScript SDK + CLI for MoltMoon token launch/trading workflows.

- Network support: `base` and `baseSepolia`
- Interfaces: TypeScript SDK and `moltlaunch` / `mltl` CLI
- Core actions: launch token, list tokens, buy, sell, quote buy/sell

## Install

```bash
npm install @moltmoon/sdk
```

For one-off CLI usage without installing globally:

```bash
npx @moltmoon/sdk --help
# or (after publish)
npx mltl --help
```

## Quick Start (SDK)

```ts
import { MoltmoonSDK } from '@moltmoon/sdk';

const sdk = new MoltmoonSDK({
  baseUrl: 'https://api.moltmoon.xyz',
  network: 'base', // 'base' | 'baseSepolia'
  privateKey: process.env.MOLTMOON_PRIVATE_KEY as `0x${string}`
});

const result = await sdk.launchToken({
  name: 'MoltMoon',
  symbol: 'MOLTM',
  description: 'Genesis token for the MoltMoon platform',
  seedAmount: '10',
  socials: {
    website: 'https://moltmoon.xyz'
  }
});

console.log(result.hash);
```

## SDK API

### Constructor

```ts
new MoltmoonSDK({
  baseUrl: string,
  privateKey?: `0x${string}`,
  network?: 'base' | 'baseSepolia',
  rpcUrl?: string
})
```

- `baseUrl`: API endpoint (example: `https://api.moltmoon.xyz`)
- `privateKey`: required for any write action (launch/buy/sell)
- `network`: chain selection for tx signing/sending
- `rpcUrl`: optional custom RPC URL

### Read methods

- `getTokens()`
- `getMarket(marketAddress)`
- `getQuoteBuy(marketAddress, usdcIn)`
- `getQuoteSell(marketAddress, tokensIn)`

### Write methods

- `launchToken({ name, symbol, description, seedAmount, imageFile?, socials? })`
- `buy(marketAddress, usdcIn, slippageBps?)`
- `sell(marketAddress, tokensIn, tokenAddress, slippageBps?)`

### Utilities

- `calculateProgress(marketDetails)`
- `calculateMarketCap(marketDetails)`

## CLI Usage

Binary names:

- `moltlaunch`
- `mltl`

Global options:

- `--api-url <url>` API base URL (default: `https://api.moltmoon.xyz`)
- `--network <base|baseSepolia>` chain
- `--private-key <0x...>` signer private key
- `--dry-run` launch validation mode (builds intents, no tx broadcast)

### Launch

```bash
npx mltl launch \
  --name "MoltMoon" \
  --symbol "MOLTM" \
  --description "Genesis token" \
  --website "https://moltmoon.xyz" \
  --twitter "https://x.com/moltmoon" \
  --telegram "https://t.me/moltmoon" \
  --discord "https://discord.gg/moltmoon" \
  --image "./assets/logo.png" \
  --seed 10 \
  --network baseSepolia \
  --json
```

Dry-run launch (no signing/broadcast):

```bash
npx mltl launch \
  --name "MoltMoon" \
  --symbol "MOLTM" \
  --description "Genesis token" \
  --seed 10 \
  --dry-run \
  --json
```

### List tokens

```bash
npx mltl tokens --network base --json
```

### Buy

```bash
npx mltl buy \
  --market 0xMARKET \
  --usdc 5 \
  --slippage 500 \
  --network base \
  --json
```

### Sell

```bash
npx mltl sell \
  --market 0xMARKET \
  --token 0xTOKEN \
  --amount 100 \
  --slippage 500 \
  --network base \
  --json
```

### Quotes

```bash
npx mltl quote-buy --market 0xMARKET --usdc 10 --json
npx mltl quote-sell --market 0xMARKET --tokens 50 --json
```

## Environment Variables

Supported env vars (CLI):

- `MOLTMOON_API_URL`
- `MOLTMOON_NETWORK` (`base` or `baseSepolia`)
- `MOLTMOON_PRIVATE_KEY`
- `PRIVATE_KEY` (fallback)

Example `.env`:

```env
MOLTMOON_API_URL=https://api.moltmoon.xyz
MOLTMOON_NETWORK=base
MOLTMOON_PRIVATE_KEY=0x...
```

## Security Notes

- Never commit private keys.
- Never expose private keys to browsers or frontend bundles.
- Keep `.env` local (`sdk/.gitignore` ignores it).
- Use a dedicated operational wallet; keep treasury in multisig.

## Image Requirements

- `PNG` or `JPEG`
- Max file size: `5MB`
- Dimensions: min `200x200`, max `2048x2048`
- Aspect ratio: near-square (token logo format)

## Development

```bash
cd sdk
npm install
npm run build
node dist/cli.js --help
```

## Publishing to npm

If you want users to run this via `npx` directly, publish this package.

```bash
cd sdk
npm login
npm run build
npm version patch   # or minor/major
npm publish --access public
```

After publishing, users can run:

```bash
npx mltl --help
# or
npx @moltmoon/sdk --help
```

## Troubleshooting

- `Failed to fetch` / DNS issues: verify `--api-url` and domain DNS.
- `execution reverted: transfer amount exceeds allowance`: run/verify approval flow first.
- `execution reverted: transfer amount exceeds balance`: fund signer wallet with token balance.
- `private key too short`: must be 32-byte hex key with `0x` prefix.
- `not owner`: ensure contract owner matches signer/multisig permissions.

## License

MIT
