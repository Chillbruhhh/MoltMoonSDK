import { createWalletClient, http, publicActions, parseUnits, formatUnits, type WalletClient, type PublicClient, type Account, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import fetch from 'isomorphic-fetch';
import { readFile } from 'node:fs/promises';
import {
    MoltmoonConfig,
    LaunchParams,
    LaunchPreparation,
    Token,
    MarketDetails,
    QuoteResponse,
    TransactionIntent,
} from './types';

export class MoltmoonSDK {
    private baseUrl: string;
    private client?: WalletClient & PublicClient;
    private account?: Account;
    private chain: Chain;
    private readonly imageMaxBytes = 500 * 1024; // hard cap
    private readonly imageMinDim = 512;
    private readonly imageMaxDim = 2048;

    constructor(config: MoltmoonConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.chain = this.resolveChain(config);

        if (config.privateKey) {
            this.account = privateKeyToAccount(config.privateKey);
            this.client = createWalletClient({
                account: this.account,
                chain: this.chain,
                transport: http(config.rpcUrl)
            }).extend(publicActions) as any;
        }
    }

    private resolveChain(config: MoltmoonConfig): Chain {
        return base;
    }

    private normalizeUrl(value: string, field: string): string {
        try {
            return new URL(value).toString();
        } catch {
            throw new Error(`Invalid ${field} URL: ${value}`);
        }
    }

    private parseImageDimensions(buffer: Buffer, mime: string): { width: number; height: number } {
        if (mime === 'image/png') {
            if (buffer.length < 24) throw new Error('Invalid PNG image');
            return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
        }

        if (mime === 'image/jpeg') {
            let offset = 2;
            while (offset < buffer.length) {
                if (buffer[offset] !== 0xFF) {
                    offset++;
                    continue;
                }
                const marker = buffer[offset + 1];
                const hasDimensions = marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker);
                const segmentLength = buffer.readUInt16BE(offset + 2);
                if (hasDimensions) {
                    if (offset + 9 >= buffer.length) break;
                    return {
                        height: buffer.readUInt16BE(offset + 5),
                        width: buffer.readUInt16BE(offset + 7)
                    };
                }
                offset += 2 + segmentLength;
            }
            throw new Error('Could not parse JPEG dimensions');
        }

        throw new Error(`Unsupported image MIME type for dimension checks: ${mime}`);
    }

    private detectImageType(buffer: Buffer): { mime: 'image/png' | 'image/jpeg'; ext: 'png' | 'jpg' } {
        const isPng = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        if (isPng) return { mime: 'image/png', ext: 'png' };

        const isJpeg = buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        if (isJpeg) return { mime: 'image/jpeg', ext: 'jpg' };

        throw new Error('Unsupported image format. Use PNG or JPEG.');
    }

    private validateImageShape(dimensions: { width: number; height: number }): void {
        const { width, height } = dimensions;
        const minDim = this.imageMinDim;
        const maxDim = this.imageMaxDim;
        if (width < minDim || height < minDim) {
            throw new Error(`Image too small (${width}x${height}). Minimum is ${minDim}x${minDim}.`);
        }
        if (width > maxDim || height > maxDim) {
            throw new Error(`Image too large (${width}x${height}). Maximum is ${maxDim}x${maxDim}.`);
        }
        if (Math.abs(width - height) > 2) {
            throw new Error(`Image must be square. Got ${width}x${height}.`);
        }
    }

    private normalizeDataUrlImage(dataUrl: string): string {
        const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=]+)$/i);
        if (!match) {
            throw new Error('Invalid data URL image. Use base64 PNG or JPEG.');
        }

        const claimedMime = match[1].toLowerCase();
        const imageBuffer = Buffer.from(match[2], 'base64');
        if (imageBuffer.length > this.imageMaxBytes) {
            throw new Error(`Image exceeds ${this.imageMaxBytes / 1024}KB hard cap.`);
        }

        const imageType = this.detectImageType(imageBuffer);
        if (claimedMime !== imageType.mime && !(claimedMime === 'image/jpg' && imageType.mime === 'image/jpeg')) {
            throw new Error(`Image MIME/content mismatch. Claimed ${claimedMime}, detected ${imageType.mime}.`);
        }

        const dimensions = this.parseImageDimensions(imageBuffer, imageType.mime);
        this.validateImageShape(dimensions);
        return `data:${imageType.mime};base64,${imageBuffer.toString('base64')}`;
    }

    private async normalizeImageInput(imageFile: LaunchParams['imageFile']): Promise<string | undefined> {
        if (!imageFile) return undefined;

        if (typeof imageFile === 'string' && imageFile.startsWith('data:image/')) {
            return this.normalizeDataUrlImage(imageFile);
        }

        let imageBuffer: Buffer;
        if (Buffer.isBuffer(imageFile)) {
            imageBuffer = imageFile;
        } else if (typeof imageFile === 'string') {
            imageBuffer = await readFile(imageFile);
        } else {
            throw new Error('Unsupported imageFile type. Use Buffer, data URL, or local file path.');
        }

        const maxBytes = this.imageMaxBytes;
        if (imageBuffer.length > maxBytes) {
            throw new Error(`Image exceeds ${maxBytes / 1024}KB hard cap.`);
        }

        const imageType = this.detectImageType(imageBuffer);
        const dimensions = this.parseImageDimensions(imageBuffer, imageType.mime);
        this.validateImageShape(dimensions);
        return `data:${imageType.mime};base64,${imageBuffer.toString('base64')}`;
    }

    private validateLaunchParams(params: LaunchParams): void {
        const name = params.name.trim();
        const symbol = params.symbol.trim();
        const description = params.description.trim();
        if (name.length < 2 || name.length > 64) throw new Error('Token name must be 2-64 characters.');
        if (!/^[A-Za-z0-9]{2,12}$/.test(symbol)) throw new Error('Token symbol must be 2-12 alphanumeric characters.');
        if (description.length < 5 || description.length > 500) throw new Error('Description must be 5-500 characters.');
        const seed = Number(params.seedAmount);
        if (!Number.isFinite(seed) || seed < 20) throw new Error('Seed amount must be at least 20 USDC.');
    }

    private async buildLaunchMetadata(params: LaunchParams): Promise<{ metadataURI: string; imageUrl?: string }> {
        this.validateLaunchParams(params);
        let imageUrl = '';
        const imageDataUrl = await this.normalizeImageInput(params.imageFile);

        if (imageDataUrl) {
            const res = await this.request<{ url: string }>('/upload/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageDataUrl })
            });
            imageUrl = res.url;
        }

        const metadata: any = {
            name: params.name.trim(),
            symbol: params.symbol.trim(),
            description: params.description.trim(),
            external_url: 'https://moltmoon.xyz',
            platform: 'Built with MoltMoon SDK'
        };

        if (imageUrl) metadata.image = imageUrl;
        if (params.socials?.website) metadata.website = this.normalizeUrl(params.socials.website, 'website');
        if (params.socials?.twitter) metadata.twitter = this.normalizeUrl(params.socials.twitter, 'twitter');
        if (params.socials?.telegram) metadata.telegram = this.normalizeUrl(params.socials.telegram, 'telegram');
        if (params.socials?.discord) metadata.discord = this.normalizeUrl(params.socials.discord, 'discord');

        const metadataURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
        return { metadataURI, imageUrl: imageUrl || undefined };
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
            chain: this.chain,
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

    async prepareLaunchToken(params: LaunchParams): Promise<LaunchPreparation> {
        const { metadataURI, imageUrl } = await this.buildLaunchMetadata(params);
        const approveIntent = await this.request<TransactionIntent>('/intent/factory/approve-seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: params.seedAmount })
        });
        const createIntent = await this.request<TransactionIntent>('/intent/tokens/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: params.name.trim(),
                symbol: params.symbol.trim(),
                uri: metadataURI,
                seedAmount: params.seedAmount
            })
        });
        return { metadataURI, imageUrl, approveIntent, createIntent };
    }

    /**
     * Launch a new token.
     * Handles: Image Upload -> Metadata -> Approve Seed -> Create Token
     */
    async launchToken(params: LaunchParams): Promise<{ hash: string, tokenAddress?: string }> {
        const prep = await this.prepareLaunchToken(params);
        await this.executeIntent(prep.approveIntent);
        const createIntent = prep.createIntent;
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
        const usdcInWei = parseUnits(String(usdcIn), 6);
        let approveWei = usdcInWei;

        // Some market implementations pull more than the nominal input (e.g., fee-inclusive transfer).
        // Approve quote-aware amount with a small cushion to avoid allowance reverts.
        try {
            const quote = await this.getQuoteBuy(marketAddress, usdcIn);
            const feeWei = parseUnits(String(quote.feePaid || '0'), 6);
            approveWei = usdcInWei + feeWei;
        } catch {
            // If quote lookup fails, keep using usdcIn as baseline.
            approveWei = usdcInWei;
        }
        const cushionWei = usdcInWei / 10n; // +10%
        approveWei += cushionWei > 0n ? cushionWei : 1n;
        const approveAmount = formatUnits(approveWei, 6);

        // 1. Approve USDC
        const approveIntent = await this.request<TransactionIntent>(`/intent/markets/${marketAddress}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: approveAmount })
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
