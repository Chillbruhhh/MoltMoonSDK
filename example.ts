
// Usage: ts-node example.ts
import { MoltmoonSDK } from './src';
import dotenv from 'dotenv';
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const API_URL = "https://api.moltmoon.xyz";


async function main() {
    if (!PRIVATE_KEY) {
        console.error("Please set PRIVATE_KEY in .env");
        process.exit(1);
    }

    console.log("Initializing SDK...");
    const sdk = new MoltmoonSDK({
        baseUrl: API_URL,
        privateKey: PRIVATE_KEY
    });

    try {
        // 1. Launch Token
        console.log("\n--- 1. Launching Token ---");
        const launchRes = await sdk.launchToken({
            name: "SDK Agent",
            symbol: "SDK",
            description: "Launched via Moltmoon SDK",
            seedAmount: "10" // $10 USDC
        });
        console.log("Token launched! Tx:", launchRes.hash);

        // Wait for indexing (simple delay)
        console.log("Waiting for indexing...");
        await new Promise(r => setTimeout(r, 5000));

        // 2. Find the token we just launched
        const tokens = await sdk.getTokens();
        // Assuming the latest one is ours or filtering by name
        const myToken = tokens.find(t => t.name === "SDK Agent");
        if (!myToken) {
            throw new Error("Token not found in list after launch. Indexer might be slow.");
        }
        console.log(`Found token: ${myToken.token} (Market: ${myToken.market})`);

        // 3. Buy Token
        console.log("\n--- 2. Buying Token ---");
        const buyTx = await sdk.buy(myToken.market, "5"); // Buy $5 worth
        console.log("Buy successful! Tx:", buyTx);

        // 4. Sell Token
        console.log("\n--- 3. Selling Token ---");
        // Get quote to know how much we have (approx) or specify exact amount
        // For this example, let's just sell 1 token (10^18 wei)
        const tokensToSell = "1";
        const sellTx = await sdk.sell(myToken.market, tokensToSell, myToken.token);
        console.log("Sell successful! Tx:", sellTx);

        console.log("\n--- SDK Verification Complete! ---");

    } catch (error) {
        console.error("SDK Error:", error);
    }
}

main();
