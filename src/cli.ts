#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { MoltmoonSDK } from './index';
import type { MoltmoonConfig } from './types';

dotenv.config();

type CliOptions = {
    apiUrl?: string;
    network?: 'base' | 'baseSepolia';
    privateKey?: string;
};

const DEFAULT_API_URL = 'https://api.moltmoon.xyz';

function fail(message: string, asJson = false): never {
    if (asJson) {
        console.error(JSON.stringify({ success: false, error: message }));
    } else {
        console.error(`Error: ${message}`);
    }
    process.exit(1);
}

function resolveBaseUrl(options: CliOptions): string {
    return options.apiUrl || process.env.MOLTMOON_API_URL || DEFAULT_API_URL;
}

function resolveNetwork(options: CliOptions, baseUrl: string): 'base' | 'baseSepolia' {
    if (options.network) return options.network;
    if (process.env.MOLTMOON_NETWORK === 'base' || process.env.MOLTMOON_NETWORK === 'baseSepolia') {
        return process.env.MOLTMOON_NETWORK;
    }
    return baseUrl.toLowerCase().includes('sepolia') ? 'baseSepolia' : 'base';
}

function createSDK(options: CliOptions, requireSigner = false): MoltmoonSDK {
    const baseUrl = resolveBaseUrl(options);
    const network = resolveNetwork(options, baseUrl);
    const privateKey = (options.privateKey || process.env.MOLTMOON_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}` | undefined;

    if (requireSigner && !privateKey) {
        fail('Missing private key. Set MOLTMOON_PRIVATE_KEY (or PRIVATE_KEY) or pass --private-key.');
    }

    const config: MoltmoonConfig = {
        baseUrl,
        network,
        privateKey
    };

    return new MoltmoonSDK(config);
}

const program = new Command();

program
    .name('moltlaunch')
    .description('Moltmoon Launchpad CLI')
    .version('0.2.0')
    .option('--api-url <url>', 'API base URL (default: https://api.moltmoon.xyz)')
    .option('--network <network>', 'base | baseSepolia')
    .option('--private-key <hex>', 'Signer private key (0x...)');

program.command('launch')
    .description('Launch a new AI Agent Token')
    .requiredOption('-n, --name <string>', 'Token name')
    .requiredOption('-s, --symbol <string>', 'Token symbol')
    .requiredOption('-d, --description <string>', 'Token description')
    .option('-w, --website <string>', 'Website URL')
    .option('--seed <amount>', 'Seed liquidity in USDC', '100')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global, true);
            const result = await sdk.launchToken({
                name: options.name,
                symbol: options.symbol,
                description: options.description,
                seedAmount: options.seed,
                socials: {
                    website: options.website
                }
            });

            if (options.json) {
                console.log(JSON.stringify({ success: true, ...result }));
                return;
            }

            console.log('Success!');
            console.log(`Hash: ${result.hash}`);
            console.log(`Explorer: https://${resolveNetwork(global, resolveBaseUrl(global)) === 'base' ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${result.hash}`);
        } catch (error: any) {
            fail(error.message, options.json);
        }
    });

program.command('tokens')
    .description('List tokens')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global);
            const tokens = await sdk.getTokens();
            if (options.json) {
                console.log(JSON.stringify({ success: true, count: tokens.length, tokens }));
                return;
            }
            console.table(tokens.map((t) => ({
                symbol: t.symbol,
                name: t.name,
                token: t.token,
                market: t.market
            })));
        } catch (error: any) {
            fail(error.message, options.json);
        }
    });

program.command('buy')
    .description('Buy token from a market')
    .requiredOption('--market <address>', 'Market address')
    .requiredOption('--usdc <amount>', 'USDC amount to spend')
    .option('--slippage <bps>', 'Slippage in bps', '500')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global, true);
            const hash = await sdk.buy(options.market, options.usdc, Number(options.slippage));
            if (options.json) {
                console.log(JSON.stringify({ success: true, hash }));
                return;
            }
            console.log(`Buy tx: ${hash}`);
        } catch (error: any) {
            fail(error.message, options.json);
        }
    });

program.command('sell')
    .description('Sell token into a market')
    .requiredOption('--market <address>', 'Market address')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--amount <tokensIn>', 'Token amount to sell')
    .option('--slippage <bps>', 'Slippage in bps', '500')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global, true);
            const hash = await sdk.sell(options.market, options.amount, options.token, Number(options.slippage));
            if (options.json) {
                console.log(JSON.stringify({ success: true, hash }));
                return;
            }
            console.log(`Sell tx: ${hash}`);
        } catch (error: any) {
            fail(error.message, options.json);
        }
    });

program.command('quote-buy')
    .description('Get buy quote')
    .requiredOption('--market <address>', 'Market address')
    .requiredOption('--usdc <amount>', 'USDC amount')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global);
            const quote = await sdk.getQuoteBuy(options.market, options.usdc);
            if (options.json) {
                console.log(JSON.stringify({ success: true, quote }));
                return;
            }
            console.log(`Out: ${quote.amountOut} | Fee: ${quote.feePaid}`);
        } catch (error: any) {
            fail(error.message, options.json);
        }
    });

program.command('quote-sell')
    .description('Get sell quote')
    .requiredOption('--market <address>', 'Market address')
    .requiredOption('--tokens <amount>', 'Token amount')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global);
            const quote = await sdk.getQuoteSell(options.market, options.tokens);
            if (options.json) {
                console.log(JSON.stringify({ success: true, quote }));
                return;
            }
            console.log(`Out: ${quote.amountOut} | Fee: ${quote.feePaid}`);
        } catch (error: any) {
            fail(error.message, options.json);
        }
    });

program.parse();
