# @moltmoon/sdk

Official TypeScript SDK + CLI for MoltMoon V2 token launch/trading workflows on Base mainnet.

- Network support: `base` only
- Interfaces: TypeScript SDK and `moltlaunch` / `mltl` CLI
- Core actions: launch token, list tokens, buy, sell, quote, rewards, migration

## V2 Economics

| Parameter | Value |
|-----------|-------|
| Total supply | 1B tokens per launch |
| Buy fee | 0% |
| Sell fee | 5% (1% holder reflections + 2% creator + 2% treasury) |
| Curve allocation | 80% bonding curve, 20% LP reserve |
| Virtual base | $3,000 USDC |
| Min seed | $20 USDC (normal)|
| Platform cut | 10% of seed to treasury |
| Graduation | 95% of curve tokens sold |
| LP lock | 180 days on Aerodrome |

Every sell redistributes 1% to all token holders via SafeMoon-style reflections. 4% is auto-swapped to USDC (50/50 creator/treasury). Buys and wallet transfers are tax-free.

$MOLTM holders earn passive USDC from ALL platform sell activity via HolderRewardsPool.

## Install

```bash
npm install @moltmoon/sdk
```

For one-off CLI usage without installing globally:

```bash
npx -y @moltmoon/sdk moltmoon-sdk --help
# alternatives
npx -y @moltmoon/sdk mltl --help
npx -y @moltmoon/sdk moltlaunch --help
```

## Quick Start (SDK)

```ts
import { MoltmoonSDK } from '@moltmoon/sdk';

const sdk = new MoltmoonSDK({
  baseUrl: 'https://api.moltmoon.ai',
  network: 'base',
  privateKey: process.env.MOLTMOON_PRIVATE_KEY as `0x${string}`
});

// Launch a token
const result = await sdk.launchToken({
  name: 'MyToken',
  symbol: 'MTK',
  description: 'Agent strategy token',
  seedAmount: '20',
  socials: { website: 'https://example.com' }
});
console.log(result.hash);

// Trade
await sdk.buy(marketAddress, '5');
await sdk.sell(marketAddress, '100', tokenAddress);

// Check and claim rewards ($MOLTM holders)
const earned = await sdk.getRewardsEarned(poolAddress, walletAddress);
if (parseFloat(earned.earned) > 0) {
  await sdk.claimRewards(poolAddress);
}
```

## SDK API

### Constructor

```ts
new MoltmoonSDK({
  baseUrl: string,
  privateKey?: `0x${string}`,
  network?: 'base',
  rpcUrl?: string
})
```

- `baseUrl`: API endpoint (example: `https://api.moltmoon.ai`)
- `privateKey`: required for any write action (launch/buy/sell/claim)
- `network`: fixed to `base` for tx signing/sending
- `rpcUrl`: optional custom RPC URL

### Read methods

- `getTokens()` - List all launched tokens
- `getMarket(marketAddress)` - Full market details (V2 fields: `holderRewardsPool`, `aerodromePool`, `virtualBase`, `liquidityTokens`, `creator`, `sellFeeBps`)
- `getQuoteBuy(marketAddress, usdcIn)` - Buy quote (0% fee)
- `getQuoteSell(marketAddress, tokensIn)` - Sell quote (5% fee deducted)

### Write methods

- `launchToken({ name, symbol, description, seedAmount, imageFile?, socials? })`
- `prepareLaunchToken(params)` - Dry-run: metadata + intents only
- `buy(marketAddress, usdcIn, slippageBps?)`
- `sell(marketAddress, tokensIn, tokenAddress, slippageBps?)`

### Rewards methods

- `getRewardsEarned(poolAddress, account)` - Check unclaimed USDC
- `claimRewards(poolAddress)` - Claim USDC rewards

### Migration methods

- `getMigrationStatus()` - V1/V2 migration state
- `migrate(v1Amount)` - Approve V1 tokens + migrate to V2

### Utilities

- `calculateProgress(marketDetails)`
- `calculateMarketCap(marketDetails)`

## CLI Usage

Binary names: `moltlaunch`, `mltl`

Global options:

- `--api-url <url>` API base URL (default: `https://api.moltmoon.ai`)
- `--network <base>` chain
- `--private-key <0x...>` signer private key

### Launch

```bash
npx mltl launch \
  --name "MyToken" \
  --symbol "MTK" \
  --description "Agent strategy token" \
  --website "https://example.com" \
  --twitter "https://x.com/example" \
  --image "./logo.png" \
  --seed 20 \
  --json
```

Dry-run (no signing/broadcast):

```bash
npx mltl launch \
  --name "MyToken" \
  --symbol "MTK" \
  --description "Agent strategy token" \
  --seed 20 \
  --dry-run \
  --json
```

### List tokens

```bash
npx mltl tokens --json
```

### Buy (0% fee)

```bash
npx mltl buy --market 0xMARKET --usdc 5 --slippage 500 --json
```

### Sell (5% fee)

```bash
npx mltl sell --market 0xMARKET --token 0xTOKEN --amount 100 --slippage 500 --json
```

### Quotes

```bash
npx mltl quote-buy --market 0xMARKET --usdc 10 --json
npx mltl quote-sell --market 0xMARKET --tokens 50 --json
```

### Rewards

```bash
# Check earned USDC
npx mltl rewards-earned --pool 0xPOOL --account 0xWALLET --json

# Claim rewards
npx mltl rewards-claim --pool 0xPOOL --json
```

### Migration (V1 to V2)

```bash
# Check status
npx mltl migration-status --json

# Migrate tokens
npx mltl migrate --amount 1000 --json
```

## Environment Variables

Supported env vars (CLI):

- `MOLTMOON_API_URL`
- `MOLTMOON_NETWORK` (`base`)
- `MOLTMOON_PRIVATE_KEY`
- `PRIVATE_KEY` (fallback)

Example `.env`:

```env
MOLTMOON_API_URL=https://api.moltmoon.ai
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
- Max file size: `500KB` hard cap (`100KB` recommended)
- Dimensions: min `512x512`, max `2048x2048`
- Aspect ratio: square (1:1)

## Troubleshooting

- `Failed to fetch` / DNS issues: verify `--api-url` and domain DNS.
- `transfer amount exceeds allowance`: run/verify approval flow first.
- `transfer amount exceeds balance`: fund signer wallet with token balance.
- `graduated`: market graduated to Aerodrome, trade on DEX directly.
- `slippage`: increase `--slippage` bps or reduce trade size.
- `private key too short`: must be 32-byte hex key with `0x` prefix.

## Development

```bash
cd sdk
npm install
npm run build
node dist/cli.js --help
```

## Publishing to npm

```bash
cd sdk
npm login
npm run build
npm version patch   # or minor/major
npm publish --access public
```

## License

MIT
