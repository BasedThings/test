import type { MarketMatchWithMarkets } from './match.js';
import type { ArbitrageStatus, Platform } from './platform.js';

export interface ArbitrageStrategy {
  buyPlatform: Platform;
  buyOutcome: 'YES' | 'NO';
  buyPrice: number;
  sellPlatform: Platform;
  sellOutcome: 'YES' | 'NO';
  sellPrice: number;
}

export interface ArbitrageOpportunity {
  id: string;
  matchId: string;

  // Strategy
  strategy: ArbitrageStrategy;

  // Spread calculation
  grossSpread: number;
  netSpread: number;
  spreadPercentage: number;

  // Fee breakdown
  sourceFee: number;
  targetFee: number;
  totalFees: number;

  // Prices at detection
  sourceYesPrice: number;
  sourceNoPrice: number;
  targetYesPrice: number;
  targetNoPrice: number;

  // Liquidity analysis
  maxProfitableSize: number;
  liquidityScore: number;
  estimatedSlippage: number;

  // Confidence scoring
  confidenceScore: number;
  freshnessScore: number;
  consistencyScore: number;
  confidenceFactors: ConfidenceFactors;

  // Execution plan
  executionSteps: ExecutionStep[];
  estimatedExecutionMs?: number;

  // Status
  status: ArbitrageStatus;
  detectedAt: string;
  expiresAt?: string;
  closedAt?: string;
  closedReason?: string;

  // Data quality
  sourceDataAge: number;
  targetDataAge: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface ArbitrageOpportunityWithMatch extends ArbitrageOpportunity {
  match: MarketMatchWithMarkets;
}

export interface ConfidenceFactors {
  freshness: {
    score: number;
    sourceAgeMs: number;
    targetAgeMs: number;
    maxAcceptableAgeMs: number;
  };
  liquidity: {
    score: number;
    sourceLiquidity: number;
    targetLiquidity: number;
    minRequiredLiquidity: number;
  };
  consistency: {
    score: number;
    priceVolatility: number;
    recentPriceChanges: number;
  };
  matchQuality: {
    score: number;
    semanticScore: number;
    resolutionScore: number;
  };
}

export interface ExecutionStep {
  order: number;
  platform: Platform;
  action: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  price: number;
  quantity: number;
  estimatedCost: number;
  estimatedFee: number;
  estimatedSlippage: number;
  url: string;
  instructions: string;
}

export interface ExecutionPlan {
  opportunityId: string;
  investmentAmount: number;
  steps: ExecutionStep[];
  summary: ExecutionSummary;
  risks: string[];
  partialFillScenarios: PartialFillScenario[];
}

export interface ExecutionSummary {
  totalCost: number;
  expectedProfit: number;
  netProfitAfterFees: number;
  roi: number;
  annualizedRoi?: number;
  breakEvenPrice: number;
}

export interface PartialFillScenario {
  fillPercentage: number;
  adjustedProfit: number;
  adjustedRoi: number;
  recommendation: string;
}

export interface ArbitrageFilters {
  status?: ArbitrageStatus | 'all';
  minSpread?: number;
  minConfidence?: number;
  minLiquidity?: number;
  maxSlippage?: number;
  platforms?: Platform[];
  category?: string;
  sortBy?: 'netSpread' | 'confidence' | 'liquidity' | 'detectedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
