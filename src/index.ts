import { createWalletClient, http, publicActions, type WalletClient, type PublicClient, type Account, hexToBigInt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import FormData from 'form-data';
import fetch from 'isomorphic-fetch';
import {
    MoltmoonConfig,
    LaunchParams,
    Token,
    MarketDetails,
    QuoteResponse,
    TransactionIntent,
    TokenMetadata
} from './types';

export class MoltmoonSDK {
    private baseUrl: string;
    private client?: WalletClient & PublicClient;
    private account?: Account;

    constructor(config: MoltmoonConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');

        if (config.privateKey) {
            this.account = privateKeyToAccount(config.privateKey);
            this.client = createWalletClient({
                account: this.account,
                chain: baseSepolia,
                transport: http()
            }).extend(publicActions) as any;
        }
    }

    // =========================================================================
    // Helper Internal Methods
    // =========================================================================
    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, options);
        const contentType = res.headers.get("content-type");

        if (!res.ok) {
            let errorMsg = res.statusText;
            if (contentType && contentType.includes("application/json")) {
                const data: any = await res.json();
                errorMsg = data.error || errorMsg;
            }
            throw new Error(`API Error [${res.status}]: ${errorMsg}`);
        }

        if (contentType && contentType.includes("application/json")) {
            return res.json() as Promise<T>;
        }
        return res.text() as unknown as Promise<T>;
    }

    private async executeIntent(intent: TransactionIntent): Promise<`0x${string}`> {
        if (!this.client || !this.account) {
            throw new Error("Private key required to execute transactions. Initialize SDK with privateKey.");
        }

        console.log(`Executing: ${intent.description}`);
        const hash = await this.client.sendTransaction({
            to: intent.to,
            data: intent.data,
            value: BigInt(intent.value || '0'),
            chain: baseSepolia,
            account: this.account
        });

        console.log(`Tx sent: ${hash}. Waiting for confirmation...`);
        await this.client.waitForTransactionReceipt({ hash });
        console.log(`Confirmed.`);
        return hash;
    }

    // =========================================================================
    // Read Methods
    // =========================================================================
    async getTokens(): Promise<Token[]> {
        const res = await this.request<{ tokens: Token[] }>('/tokens');
        return res.tokens;
    }

    async getMarket(marketAddress: string): Promise<MarketDetails> {
        return this.request<MarketDetails>(`/markets/${marketAddress}`);
    }

    async getQuoteBuy(marketAddress: string, usdcIn: string): Promise<QuoteResponse> {
        return this.request<QuoteResponse>(`/markets/${marketAddress}/quote/buy?usdcIn=${usdcIn}`);
    }

    async getQuoteSell(marketAddress: string, tokensIn: string): Promise<QuoteResponse> {
        return this.request<QuoteResponse>(`/markets/${marketAddress}/quote/sell?tokensIn=${tokensIn}`);
    }

    // =========================================================================
    // Utilities
    // =========================================================================
    calculateProgress(details: MarketDetails): number {
        return details.progressPercent;
    }

    calculateMarketCap(details: MarketDetails): number {
        // baseReserveReal is 6 decimals USDC
        return Number(details.baseReserveReal) / 1000000;
    }

    // =========================================================================
    // Action Methods
    // =========================================================================

    /**
     * Launch a new token.
     * Handles: Image Upload -> Approve Seed -> Create Token
     */
    async launchToken(params: LaunchParams): Promise<{ hash: string, tokenAddress?: string }> {
        let imageUrl = "";

        // 1. Upload Image (if provided)
        if (params.imageFile) {
            // Logic depends on environment (Buffer vs File). Assuming Node.js Buffer or Stream for now.
            // Ideally user passes base64 string or we handle form-data.
            // For simplicity in this SDK version, let's assume raw base64 string if it starts with "data:", 
            // otherwise straightforward logic if we want to support streams would need 'form-data' package properly.

            // If user passed a Buffer/Stream, we'd use FormData. 
            // Here we will support a direct base64 string for simplicity or try to upload buffer.

            // NOTE: Our API expects JSON body with base64 string for this endpoint in index.ts:
            // app.post("/upload/image", ... { image: "data:..." })

            let base64Image = params.imageFile;
            if (Buffer.isBuffer(params.imageFile)) {
                base64Image = `data:image/png;base64,${params.imageFile.toString('base64')}`;
            }

            const res = await this.request<{ url: string }>('/upload/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });
            imageUrl = res.url;
        }

        // 2. Prepare Metadata URI
        const metadata: any = {
            name: params.name,
            symbol: params.symbol,
            description: params.description,
            external_url: "https://moltmoon.xyz",
            platform: "Built with MoltMoon SDK"
        };
        if (imageUrl) metadata.image = imageUrl;
        if (params.socials) {
            if (params.socials.website) metadata.website = params.socials.website;
            if (params.socials.twitter) metadata.twitter = params.socials.twitter;
        }

        const metadataJSON = JSON.stringify(metadata);
        const metadataURI = `data:application/json;base64,${Buffer.from(metadataJSON).toString('base64')}`;

        // 3. Approve Seed USDC
        const approveIntent = await this.request<TransactionIntent>('/intent/factory/approve-seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: params.seedAmount })
        });

        // We execute approval. Failure here throws error.
        await this.executeIntent(approveIntent);

        // 4. Create Token
        const createIntent = await this.request<TransactionIntent>('/intent/tokens/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: params.name,
                symbol: params.symbol,
                uri: metadataURI,
                seedAmount: params.seedAmount
            })
        });

        const hash = await this.executeIntent(createIntent);

        // Determining token address would require decoding logs, 
        // for now we return the hash. The consumer can poll getTokens().
        return { hash };
    }

    /**
     * Buy Token.
     * Handles: Approve USDC -> Buy
     */
    async buy(marketAddress: string, usdcIn: string, slippageBps = 500): Promise<string> {
        // 1. Approve USDC
        const approveIntent = await this.request<TransactionIntent>(`/intent/markets/${marketAddress}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: usdcIn })
        });
        await this.executeIntent(approveIntent);

        // 2. Buy
        const buyIntent = await this.request<TransactionIntent>(`/intent/markets/${marketAddress}/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usdcIn, slippageBps })
        });
        return this.executeIntent(buyIntent);
    }

    /**
     * Sell Token.
     * Handles: Approve Token -> Sell
     */
    async sell(marketAddress: string, tokensIn: string, tokenAddress: string, slippageBps = 500): Promise<string> {
        // 1. Approve Token
        // API expects: POST /intent/tokens/:token/approve { spender: market, amount }
        const approveIntent = await this.request<TransactionIntent>(`/intent/tokens/${tokenAddress}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spender: marketAddress, amount: tokensIn })
        });
        await this.executeIntent(approveIntent);

        // 2. Sell
        const sellIntent = await this.request<TransactionIntent>(`/intent/markets/${marketAddress}/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokensIn, slippageBps })
        });
        return this.executeIntent(sellIntent);
    }
}
