import DecimalJS from 'decimal.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type {
  Platform,
  NormalizedOrderBook,
  RawOrderBookLevel,
  ArbitrageOpportunityRaw,
  ExecutionStep,
  PartialFillScenario,
} from '../../lib/types.js';

// Platform fee structures
const PLATFORM_FEES: Record<Platform, {
  makerFee: number;
  takerFee: number;
  winFee: number; // Fee on winning positions
  withdrawalFee: number;
}> = {
  POLYMARKET: {
    makerFee: 0.00,
    takerFee: 0.02, // 2% taker fee
    winFee: 0.00,
    withdrawalFee: 0.00,
  },
  KALSHI: {
    makerFee: 0.00,
    takerFee: 0.01, // 1% fee (simplified)
    winFee: 0.00,
    withdrawalFee: 0.00,
  },
  PREDICTIT: {
    makerFee: 0.00,
    takerFee: 0.05, // 5% fee on trades
    winFee: 0.10, // 10% on profits
    withdrawalFee: 0.05, // 5% withdrawal fee
  },
};

interface OrderBookAnalysis {
  platform: Platform;
  marketId: string;
  outcome: 'YES' | 'NO';
  bestBid: number | null;
  bestAsk: number | null;
  bidDepth: number; // Total $ available at top 5 levels
  askDepth: number;
  levels: RawOrderBookLevel[];
  dataAgeMs: number;
  isFresh: boolean;
}

interface FillSimulation {
  avgFillPrice: number;
  totalCost: number;
  totalSize: number;
  slippage: number;
  levelsFilled: Array<{
    price: number;
    size: number;
    fillSize: number;
  }>;
  partialFill: boolean;
}

export class ArbitrageDetector {
  private readonly minSpreadPct: number;
  private readonly minConfidence: number;
  private readonly minExecutableSize: number;
  private readonly staleThresholdMs: number;

  constructor() {
    this.minSpreadPct = env.MIN_ARBITRAGE_SPREAD_PCT / 100;
    this.minConfidence = env.MIN_CONFIDENCE_SCORE;
    this.minExecutableSize = env.MIN_EXECUTABLE_SIZE_USD;
    this.staleThresholdMs = env.ORDERBOOK_STALE_THRESHOLD_MS;
  }

  async scanForOpportunities(): Promise<ArbitrageOpportunityRaw[]> {
    logger.debug('Scanning for arbitrage opportunities...');

    // Get confirmed market matches
    const matches = await prisma.marketMatch.findMany({
      where: { status: 'CONFIRMED' },
      include: {
        sourceMarket: true,
        targetMarket: true,
      },
    });

    const opportunities: ArbitrageOpportunityRaw[] = [];

    for (const match of matches) {
      try {
        const opp = await this.analyzeMatch(match);
        if (opp && opp.profitAnalysis.netProfit > 0) {
          opportunities.push(opp);
        }
      } catch (error) {
        logger.error(`Error analyzing match ${match.id}`, error as Error);
      }
    }

    // Sort by net profit (descending)
    opportunities.sort((a, b) => b.profitAnalysis.netProfit - a.profitAnalysis.netProfit);

    logger.info(`Found ${opportunities.length} arbitrage opportunities`);
    return opportunities;
  }

  private async analyzeMatch(match: {
    id: string;
    sourceMarket: {
      id: string;
      platform: Platform;
      externalId: string;
      question: string;
      sourceUrl: string | null;
      feeRate: Decimal;
      endDate: Date | null;
    };
    targetMarket: {
      id: string;
      platform: Platform;
      externalId: string;
      question: string;
      sourceUrl: string | null;
      feeRate: Decimal;
      endDate: Date | null;
    };
    overallScore: Decimal;
  }): Promise<ArbitrageOpportunityRaw | null> {
    // Get orderbooks from Redis cache
    const sourceOB = await this.getOrderBook(
      match.sourceMarket.platform,
      match.sourceMarket.externalId
    );
    const targetOB = await this.getOrderBook(
      match.targetMarket.platform,
      match.targetMarket.externalId
    );

    if (!sourceOB || !targetOB) {
      return null; // No orderbook data available
    }

    const sourceAnalysis = this.analyzeOrderBook(sourceOB, 'YES');
    const targetAnalysis = this.analyzeOrderBook(targetOB, 'YES');

    if (!sourceAnalysis.isFresh || !targetAnalysis.isFresh) {
      logger.debug(`Stale data for match ${match.id}`);
      return null;
    }

    // Check all possible arbitrage strategies
    const strategies = [
      this.checkBuyYesSellYes(sourceAnalysis, targetAnalysis, match),
      this.checkBuyYesSellYes(targetAnalysis, sourceAnalysis, match), // Reverse
    ];

    // Find the best profitable strategy
    let bestOpp: ArbitrageOpportunityRaw | null = null;

    for (const strategy of strategies) {
      if (strategy && strategy.profitAnalysis.netProfit > 0) {
        if (!bestOpp || strategy.profitAnalysis.netProfit > bestOpp.profitAnalysis.netProfit) {
          bestOpp = strategy;
        }
      }
    }

    return bestOpp;
  }

  private async getOrderBook(
    platform: Platform,
    externalId: string
  ): Promise<NormalizedOrderBook | null> {
    const redis = getRedis();
    const key = `orderbook:${platform}:${externalId}`;
    const data = await redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data) as NormalizedOrderBook;
    } catch {
      return null;
    }
  }

  private analyzeOrderBook(ob: NormalizedOrderBook, outcome: 'YES' | 'NO'): OrderBookAnalysis {
    const now = Date.now();
    const dataAgeMs = now - new Date(ob.timestamp).getTime();
    const isFresh = dataAgeMs < this.staleThresholdMs;

    // For YES outcome, use bids/asks directly
    // For NO outcome, we'd need the inverse
    const bids = outcome === 'YES' ? ob.bids : ob.asks.map(a => ({ ...a, price: 1 - a.price }));
    const asks = outcome === 'YES' ? ob.asks : ob.bids.map(b => ({ ...b, price: 1 - b.price }));

    const bidDepth = bids.slice(0, 5).reduce((sum, l) => sum + l.size, 0);
    const askDepth = asks.slice(0, 5).reduce((sum, l) => sum + l.size, 0);

    return {
      platform: ob.platform,
      marketId: ob.externalId,
      outcome,
      bestBid: bids[0]?.price ?? null,
      bestAsk: asks[0]?.price ?? null,
      bidDepth,
      askDepth,
      levels: outcome === 'YES' ? [...bids, ...asks] : [...bids, ...asks],
      dataAgeMs,
      isFresh,
    };
  }

  private checkBuyYesSellYes(
    buyFrom: OrderBookAnalysis,
    sellTo: OrderBookAnalysis,
    match: {
      id: string;
      sourceMarket: {
        id: string;
        platform: Platform;
        externalId: string;
        question: string;
        sourceUrl: string | null;
        feeRate: Decimal;
        endDate: Date | null;
      };
      targetMarket: {
        id: string;
        platform: Platform;
        externalId: string;
        question: string;
        sourceUrl: string | null;
        feeRate: Decimal;
        endDate: Date | null;
      };
      overallScore: Decimal;
    }
  ): ArbitrageOpportunityRaw | null {
    if (buyFrom.bestAsk === null || sellTo.bestBid === null) {
      return null;
    }

    // Basic spread check
    const grossSpread = sellTo.bestBid - buyFrom.bestAsk;

    if (grossSpread <= 0) {
      return null; // No spread
    }

    // Calculate fees
    const buyFees = PLATFORM_FEES[buyFrom.platform];
    const sellFees = PLATFORM_FEES[sellTo.platform];

    const buyFee = buyFrom.bestAsk * buyFees.takerFee;
    const sellFee = sellTo.bestBid * sellFees.takerFee;
    const totalFees = buyFee + sellFee;

    const netSpreadPerShare = grossSpread - totalFees;

    if (netSpreadPerShare <= 0) {
      return null; // Not profitable after fees
    }

    // Calculate max executable size based on orderbook depth
    const maxBuySize = this.simulateFill(
      buyFrom.levels.filter(l => l.price <= buyFrom.bestAsk! * 1.05), // Allow 5% slippage
      buyFrom.askDepth,
      'BUY'
    );

    const maxSellSize = this.simulateFill(
      sellTo.levels.filter(l => l.price >= sellTo.bestBid! * 0.95),
      sellTo.bidDepth,
      'SELL'
    );

    const maxExecutableSize = Math.min(
      maxBuySize.totalSize,
      maxSellSize.totalSize,
      10000 // Cap at $10k for safety
    );

    if (maxExecutableSize < this.minExecutableSize) {
      return null; // Not enough liquidity
    }

    // Calculate expected slippage
    const combinedSlippage = (maxBuySize.slippage + maxSellSize.slippage) / 2;

    // Calculate net profit for max executable size
    const netProfit = new DecimalJS(netSpreadPerShare)
      .minus(combinedSlippage)
      .times(maxExecutableSize)
      .toNumber();

    if (netProfit <= 0) {
      return null;
    }

    // Calculate ROI
    const totalInvestment = buyFrom.bestAsk * maxExecutableSize * (1 + buyFee);
    const roi = netProfit / totalInvestment;

    // Calculate annualized ROI if we have expiry dates
    let annualizedRoi = roi;
    const endDate = match.sourceMarket.endDate || match.targetMarket.endDate;
    if (endDate) {
      const daysToExpiry = Math.max(1, (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      annualizedRoi = roi * (365 / daysToExpiry);
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(
      buyFrom,
      sellTo,
      Number(match.overallScore)
    );

    if (confidence.overall < this.minConfidence) {
      return null;
    }

    // Generate execution plan
    const executionPlan = this.generateExecutionPlan(
      buyFrom,
      sellTo,
      maxExecutableSize,
      buyFees,
      sellFees,
      match
    );

    const sourceMarket = buyFrom.platform === match.sourceMarket.platform
      ? match.sourceMarket
      : match.targetMarket;
    const targetMarket = sellTo.platform === match.targetMarket.platform
      ? match.targetMarket
      : match.sourceMarket;

    return {
      id: `${match.id}-${Date.now()}`,
      matchId: match.id,
      sourceMarket: {
        platform: sourceMarket.platform,
        marketId: sourceMarket.id,
        externalId: sourceMarket.externalId,
        question: sourceMarket.question,
        sourceUrl: sourceMarket.sourceUrl || '',
      },
      targetMarket: {
        platform: targetMarket.platform,
        marketId: targetMarket.id,
        externalId: targetMarket.externalId,
        question: targetMarket.question,
        sourceUrl: targetMarket.sourceUrl || '',
      },
      strategy: {
        action: 'BUY_YES_SELL_YES',
        buyPlatform: buyFrom.platform,
        buyPrice: buyFrom.bestAsk,
        buySize: maxExecutableSize,
        sellPlatform: sellTo.platform,
        sellPrice: sellTo.bestBid,
        sellSize: maxExecutableSize,
      },
      profitAnalysis: {
        grossSpread,
        totalFees,
        estimatedSlippage: combinedSlippage * maxExecutableSize,
        netProfit,
        roi,
        annualizedRoi,
        maxExecutableSize,
      },
      confidence,
      executionPlan,
      detectedAt: new Date(),
      sourceDataTimestamp: new Date(Date.now() - buyFrom.dataAgeMs),
      targetDataTimestamp: new Date(Date.now() - sellTo.dataAgeMs),
    };
  }

  private simulateFill(
    levels: RawOrderBookLevel[],
    totalDepth: number,
    side: 'BUY' | 'SELL'
  ): FillSimulation {
    const sortedLevels = side === 'BUY'
      ? [...levels].sort((a, b) => a.price - b.price) // Best ask first
      : [...levels].sort((a, b) => b.price - a.price); // Best bid first

    if (sortedLevels.length === 0) {
      return {
        avgFillPrice: 0,
        totalCost: 0,
        totalSize: 0,
        slippage: 0,
        levelsFilled: [],
        partialFill: true,
      };
    }

    const bestPrice = sortedLevels[0]!.price;
    let remainingSize = totalDepth;
    let totalCost = 0;
    let totalFilled = 0;
    const levelsFilled: FillSimulation['levelsFilled'] = [];

    for (const level of sortedLevels) {
      if (remainingSize <= 0) break;

      const fillSize = Math.min(level.size, remainingSize);
      totalCost += fillSize * level.price;
      totalFilled += fillSize;
      remainingSize -= fillSize;

      levelsFilled.push({
        price: level.price,
        size: level.size,
        fillSize,
      });
    }

    const avgFillPrice = totalFilled > 0 ? totalCost / totalFilled : 0;
    const slippage = Math.abs(avgFillPrice - bestPrice);

    return {
      avgFillPrice,
      totalCost,
      totalSize: totalFilled,
      slippage,
      levelsFilled,
      partialFill: remainingSize > 0,
    };
  }

  private calculateConfidence(
    buyFrom: OrderBookAnalysis,
    sellTo: OrderBookAnalysis,
    matchQuality: number
  ): {
    overall: number;
    freshness: number;
    liquidity: number;
    matchQuality: number;
    dataAgeMs: number;
  } {
    // Freshness score (how recent is the data)
    const maxAge = Math.max(buyFrom.dataAgeMs, sellTo.dataAgeMs);
    const freshnessScore = Math.max(0, 1 - (maxAge / this.staleThresholdMs));

    // Liquidity score (depth relative to typical trade size)
    const minDepth = Math.min(buyFrom.bidDepth, buyFrom.askDepth, sellTo.bidDepth, sellTo.askDepth);
    const liquidityScore = Math.min(1, minDepth / 1000); // $1000 as baseline

    // Overall confidence
    const overall = (freshnessScore * 0.35 + liquidityScore * 0.30 + matchQuality * 0.35);

    return {
      overall,
      freshness: freshnessScore,
      liquidity: liquidityScore,
      matchQuality,
      dataAgeMs: maxAge,
    };
  }

  private generateExecutionPlan(
    buyFrom: OrderBookAnalysis,
    sellTo: OrderBookAnalysis,
    size: number,
    buyFees: typeof PLATFORM_FEES[Platform],
    sellFees: typeof PLATFORM_FEES[Platform],
    match: {
      sourceMarket: { sourceUrl: string | null };
      targetMarket: { sourceUrl: string | null };
    }
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    // Step 1: Buy YES on cheaper platform
    const buyFee = buyFrom.bestAsk! * size * buyFees.takerFee;
    steps.push({
      order: 1,
      platform: buyFrom.platform,
      action: 'BUY',
      outcome: 'YES',
      quantity: size,
      limitPrice: buyFrom.bestAsk!,
      expectedFillPrice: buyFrom.bestAsk!,
      expectedSlippage: 0.005, // 0.5% estimated
      fee: buyFee,
      netCost: buyFrom.bestAsk! * size + buyFee,
      instructions: `Buy ${size.toFixed(2)} YES contracts at $${buyFrom.bestAsk!.toFixed(3)} or better`,
      platformUrl: match.sourceMarket.sourceUrl || '',
      orderbookLevels: [], // Would populate with actual levels
    });

    // Step 2: Sell YES on higher platform
    const sellFee = sellTo.bestBid! * size * sellFees.takerFee;
    steps.push({
      order: 2,
      platform: sellTo.platform,
      action: 'SELL',
      outcome: 'YES',
      quantity: size,
      limitPrice: sellTo.bestBid!,
      expectedFillPrice: sellTo.bestBid!,
      expectedSlippage: 0.005,
      fee: sellFee,
      netCost: sellTo.bestBid! * size - sellFee,
      instructions: `Sell ${size.toFixed(2)} YES contracts at $${sellTo.bestBid!.toFixed(3)} or better`,
      platformUrl: match.targetMarket.sourceUrl || '',
      orderbookLevels: [],
    });

    return steps;
  }

  generatePartialFillScenarios(opp: ArbitrageOpportunityRaw): PartialFillScenario[] {
    const scenarios: PartialFillScenario[] = [];
    const percentages = [25, 50, 75, 100];

    for (const pct of percentages) {
      const filledQty = (opp.profitAnalysis.maxExecutableSize * pct) / 100;
      const adjustedProfit = (opp.profitAnalysis.netProfit * pct) / 100;
      const adjustedRoi = opp.profitAnalysis.roi; // ROI stays the same per unit

      let risk: 'LOW' | 'MEDIUM' | 'HIGH';
      let recommendation: string;

      if (pct === 100) {
        risk = 'LOW';
        recommendation = 'Full execution recommended';
      } else if (pct >= 75) {
        risk = 'LOW';
        recommendation = 'Still profitable, consider completing second leg';
      } else if (pct >= 50) {
        risk = 'MEDIUM';
        recommendation = 'Monitor second leg carefully, may need to adjust price';
      } else {
        risk = 'HIGH';
        recommendation = 'Consider exiting position if second leg is delayed';
      }

      scenarios.push({
        fillPercentage: pct,
        filledQty,
        adjustedProfit,
        adjustedRoi,
        risk,
        recommendation,
      });
    }

    return scenarios;
  }

  async saveOpportunity(opp: ArbitrageOpportunityRaw): Promise<void> {
    await prisma.arbitrageOpportunity.create({
      data: {
        matchId: opp.matchId,
        strategy: opp.strategy as Prisma.InputJsonValue,
        grossSpread: opp.profitAnalysis.grossSpread,
        netSpread: opp.profitAnalysis.netProfit / opp.profitAnalysis.maxExecutableSize,
        spreadPercentage: opp.profitAnalysis.roi,
        sourceFee: opp.executionPlan[0]?.fee || 0,
        targetFee: opp.executionPlan[1]?.fee || 0,
        totalFees: opp.profitAnalysis.totalFees,
        sourceYesPrice: opp.strategy.buyPrice,
        sourceNoPrice: 1 - opp.strategy.buyPrice,
        targetYesPrice: opp.strategy.sellPrice,
        targetNoPrice: 1 - opp.strategy.sellPrice,
        maxProfitableSize: opp.profitAnalysis.maxExecutableSize,
        liquidityScore: opp.confidence.liquidity,
        estimatedSlippage: opp.profitAnalysis.estimatedSlippage,
        confidenceScore: opp.confidence.overall,
        freshnessScore: opp.confidence.freshness,
        consistencyScore: opp.confidence.matchQuality,
        confidenceFactors: opp.confidence as Prisma.InputJsonValue,
        executionSteps: opp.executionPlan as unknown as Prisma.InputJsonValue,
        sourceDataAge: opp.confidence.dataAgeMs,
        targetDataAge: opp.confidence.dataAgeMs,
        status: 'ACTIVE',
      },
    });
  }
}

export const arbitrageDetector = new ArbitrageDetector();
