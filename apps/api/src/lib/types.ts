// Core types for the arbitrage scanner

export type Platform = 'POLYMARKET' | 'KALSHI' | 'PREDICTIT';

export type PlatformStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE';

export interface PlatformHealth {
  platform: Platform;
  status: PlatformStatus;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  consecutiveErrors: number;
  avgLatencyMs: number;
  lastLatencyMs: number;
}

export interface RawOrderBookLevel {
  price: number;  // 0-1 scale (probability)
  size: number;   // $ amount available
}

export interface NormalizedOrderBook {
  platform: Platform;
  marketId: string;
  externalId: string;
  timestamp: Date;
  latencyMs: number;
  bids: RawOrderBookLevel[];  // Sorted high to low
  asks: RawOrderBookLevel[];  // Sorted low to high
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  spread: number | null;
}

export interface NormalizedMarket {
  platform: Platform;
  externalId: string;
  question: string;
  description: string | null;
  category: string | null;
  outcomes: string[];
  endDate: Date | null;
  resolutionSource: string | null;
  resolutionRules: string | null;
  volume: number | null;
  liquidity: number | null;
  feeRate: number;
  minOrderSize: number;
  tickSize: number;
  sourceUrl: string;
  lastUpdated: Date;
  latencyMs: number;
}

export interface NormalizedQuote {
  platform: Platform;
  marketId: string;
  externalId: string;
  outcome: 'YES' | 'NO';
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
  bidSize: number | null;
  askSize: number | null;
  volume24h: number | null;
  timestamp: Date;
  latencyMs: number;
}

export interface ArbitrageOpportunityRaw {
  id: string;
  matchId: string;
  sourceMarket: {
    platform: Platform;
    marketId: string;
    externalId: string;
    question: string;
    sourceUrl: string;
  };
  targetMarket: {
    platform: Platform;
    marketId: string;
    externalId: string;
    question: string;
    sourceUrl: string;
  };
  strategy: {
    action: 'BUY_YES_SELL_YES' | 'BUY_NO_SELL_NO' | 'BUY_YES_SELL_NO' | 'BUY_NO_SELL_YES';
    buyPlatform: Platform;
    buyPrice: number;
    buySize: number;
    sellPlatform: Platform;
    sellPrice: number;
    sellSize: number;
  };
  profitAnalysis: {
    grossSpread: number;
    totalFees: number;
    estimatedSlippage: number;
    netProfit: number;        // Worst-case profit in $
    roi: number;              // As decimal (0.05 = 5%)
    annualizedRoi: number;    // Annualized based on expiry
    maxExecutableSize: number; // $ amount that can be traded
  };
  confidence: {
    overall: number;
    freshness: number;
    liquidity: number;
    matchQuality: number;
    dataAgeMs: number;
  };
  executionPlan: ExecutionStep[];
  detectedAt: Date;
  sourceDataTimestamp: Date;
  targetDataTimestamp: Date;
}

export interface ExecutionStep {
  order: number;
  platform: Platform;
  action: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  quantity: number;
  limitPrice: number;
  expectedFillPrice: number;
  expectedSlippage: number;
  fee: number;
  netCost: number;
  instructions: string;
  platformUrl: string;
  orderbookLevels: Array<{
    price: number;
    size: number;
    fillSize: number;
  }>;
}

export interface PartialFillScenario {
  fillPercentage: number;
  filledQty: number;
  adjustedProfit: number;
  adjustedRoi: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
}
