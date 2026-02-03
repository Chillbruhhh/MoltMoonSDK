export interface MoltmoonConfig {
    baseUrl: string;
    privateKey?: `0x${string}`;
    network?: 'base' | 'baseSepolia';
    rpcUrl?: string;
}

export interface TokenMetadata {
    name: string;
    symbol: string;
    description?: string;
    image?: string; // base64 or URL
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
}

export interface LaunchParams {
    name: string;
    symbol: string;
    description: string;
    seedAmount: string; // USDC
    imageFile?: Buffer | string; // Buffer, data URL, or local file path
    socials?: {
        website?: string;
        twitter?: string;
        telegram?: string;
        discord?: string;
    };
}

export interface LaunchPreparation {
    metadataURI: string;
    imageUrl?: string;
    approveIntent: TransactionIntent;
    createIntent: TransactionIntent;
}

export interface Token {
    token: string;
    market: string;
    name: string;
    symbol: string;
    uri: string;
    totalSupply: string;
    curveTokens: string;
    creator: string;
    blockNumber: string;
    raised?: number; // Helper stat
    marketCap?: number; // Helper stat
}

export interface MarketDetails {
    market: string;
    token: string;
    graduated: boolean;
    curveTokensRemaining: string;
    baseReserveReal: string;
    totalBaseReserve: string;
    progressPercent: number;
    sellFeeBps: number;
}

export interface QuoteResponse {
    amountIn: string;
    amountOut: string;
    feePaid: string;
}

export interface TransactionIntent {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
    description?: string;
}
