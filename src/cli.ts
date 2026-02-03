#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { MoltmoonSDK } from './index';
import type { MoltmoonConfig } from './types';

dotenv.config();

type CliOptions = {
    apiUrl?: string;
    network?: 'base';
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

function resolveNetwork(options: CliOptions): 'base' {
    if (options.network && options.network !== 'base') {
        fail(`Unsupported network "${options.network}". Only "base" is supported.`);
    }
    if (process.env.MOLTMOON_NETWORK && process.env.MOLTMOON_NETWORK !== 'base') {
        fail(`Unsupported MOLTMOON_NETWORK "${process.env.MOLTMOON_NETWORK}". Only "base" is supported.`);
    }
    return 'base';
}

function createSDK(options: CliOptions, requireSigner = false): MoltmoonSDK {
    const baseUrl = resolveBaseUrl(options);
    const network = resolveNetwork(options);
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
    .option('--network <network>', 'base')
    .option('--private-key <hex>', 'Signer private key (0x...)');

program.command('launch')
    .description('Launch a new AI Agent Token')
    .requiredOption('-n, --name <string>', 'Token name')
    .requiredOption('-s, --symbol <string>', 'Token symbol')
    .requiredOption('-d, --description <string>', 'Token description')
    .option('-w, --website <string>', 'Website URL')
    .option('--twitter <string>', 'Twitter/X URL')
    .option('--telegram <string>', 'Telegram URL')
    .option('--discord <string>', 'Discord URL')
    .option('--image <pathOrDataUrl>', 'Local image path or data URL')
    .option('--seed <amount>', 'Seed liquidity in USDC', '20')
    .option('--dry-run', 'Validate/upload metadata + build intents without sending tx')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
        const global = program.opts<CliOptions>();
        try {
            const sdk = createSDK(global, !options.dryRun);
            const launchParams = {
                name: options.name,
                symbol: options.symbol,
                description: options.description,
                seedAmount: options.seed,
                imageFile: options.image,
                socials: {
                    website: options.website,
                    twitter: options.twitter,
                    telegram: options.telegram,
                    discord: options.discord
                }
            };

            if (options.dryRun) {
                const prep = await sdk.prepareLaunchToken(launchParams);
                if (options.json) {
                    console.log(JSON.stringify({ success: true, dryRun: true, ...prep }));
                    return;
                }
                console.log('Dry run OK.');
                console.log(`Approve intent to: ${prep.approveIntent.to}`);
                console.log(`Create intent to: ${prep.createIntent.to}`);
                if (prep.imageUrl) console.log(`Uploaded image: ${prep.imageUrl}`);
                return;
            }

            const result = await sdk.launchToken(launchParams);

            if (options.json) {
                console.log(JSON.stringify({ success: true, ...result }));
                return;
            }

            console.log('Success!');
            console.log(`Hash: ${result.hash}`);
            console.log(`Explorer: https://basescan.org/tx/${result.hash}`);
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
