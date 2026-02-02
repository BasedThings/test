import type { RequestHandler } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';

import { prisma } from '../config/database.js';
import { cacheService } from '../services/cache/CacheService.js';
import { AppError } from '../middleware/errorHandler.js';
import { arbitrageDetector } from '../services/arbitrage/ArbitrageDetector.js';
import { ingestionOrchestrator } from '../services/ingestion/IngestionOrchestrator.js';

const arbitrageQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'EXPIRED', 'all']).default('ACTIVE'),
  minSpread: z.coerce.number().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  minLiquidity: z.coerce.number().optional(),
  maxSlippage: z.coerce.number().optional(),
  platforms: z.string().optional(),
  category: z.string().optional(),
  sortBy: z.enum(['netSpread', 'confidence', 'liquidity', 'detectedAt']).default('netSpread'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const getArbitrageOpportunities: RequestHandler = async (req, res, next) => {
  try {
    const query = arbitrageQuerySchema.parse(req.query);

    const cacheKey = `arbitrage:${JSON.stringify(query)}`;
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      res.json({
        ...cached,
        meta: { fetchedAt: new Date().toISOString(), cacheHit: true },
      });
      return;
    }

    const where: Record<string, unknown> = {};

    if (query.status !== 'all') {
      where.status = query.status;
    }

    if (query.minSpread !== undefined) {
      where.netSpread = { gte: query.minSpread };
    }

    if (query.minConfidence !== undefined) {
      where.confidenceScore = { gte: query.minConfidence };
    }

    if (query.minLiquidity !== undefined) {
      where.maxProfitableSize = { gte: query.minLiquidity };
    }

    if (query.maxSlippage !== undefined) {
      where.estimatedSlippage = { lte: query.maxSlippage };
    }

    const orderByField = query.sortBy === 'confidence' ? 'confidenceScore' : query.sortBy;
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[orderByField] = query.sortOrder;

    const [opportunities, total] = await Promise.all([
      prisma.arbitrageOpportunity.findMany({
        where,
        orderBy,
        take: query.limit,
        skip: query.offset,
        include: {
          match: {
            include: {
              sourceMarket: {
                select: {
                  id: true,
                  platform: true,
                  externalId: true,
                  question: true,
                  yesPrice: true,
                  noPrice: true,
                  yesBid: true,
                  yesAsk: true,
                  sourceUrl: true,
                  lastFetchedAt: true,
                  fetchLatencyMs: true,
                },
              },
              targetMarket: {
                select: {
                  id: true,
                  platform: true,
                  externalId: true,
                  question: true,
                  yesPrice: true,
                  noPrice: true,
                  yesBid: true,
                  yesAsk: true,
                  sourceUrl: true,
                  lastFetchedAt: true,
                  fetchLatencyMs: true,
                },
              },
            },
          },
        },
      }),
      prisma.arbitrageOpportunity.count({ where }),
    ]);

    const response = {
      data: opportunities.map((opp: typeof opportunities[number]) => ({
        id: opp.id,
        matchId: opp.matchId,
        strategy: opp.strategy,
        profitAnalysis: {
          grossSpread: opp.grossSpread.toNumber(),
          netSpread: opp.netSpread.toNumber(),
          spreadPercentage: opp.spreadPercentage.toNumber(),
          totalFees: opp.totalFees.toNumber(),
          roi: opp.spreadPercentage.toNumber(),
          annualizedRoi: opp.spreadPercentage.toNumber() * 12, // Simplified
          maxExecutableSize: opp.maxProfitableSize.toNumber(),
        },
        confidence: {
          overall: opp.confidenceScore.toNumber(),
          freshness: opp.freshnessScore.toNumber(),
          liquidity: opp.liquidityScore.toNumber(),
          consistency: opp.consistencyScore.toNumber(),
          dataAgeMs: Math.max(opp.sourceDataAge, opp.targetDataAge),
        },
        status: opp.status,
        detectedAt: opp.detectedAt.toISOString(),
        match: {
          id: opp.match.id,
          overallScore: opp.match.overallScore.toNumber(),
          sourceMarket: {
            ...opp.match.sourceMarket,
            yesPrice: opp.match.sourceMarket.yesPrice.toNumber(),
            noPrice: opp.match.sourceMarket.noPrice.toNumber(),
            yesBid: opp.match.sourceMarket.yesBid?.toNumber(),
            yesAsk: opp.match.sourceMarket.yesAsk?.toNumber(),
            latencyMs: opp.match.sourceMarket.fetchLatencyMs,
            dataTimestamp: opp.match.sourceMarket.lastFetchedAt.toISOString(),
          },
          targetMarket: {
            ...opp.match.targetMarket,
            yesPrice: opp.match.targetMarket.yesPrice.toNumber(),
            noPrice: opp.match.targetMarket.noPrice.toNumber(),
            yesBid: opp.match.targetMarket.yesBid?.toNumber(),
            yesAsk: opp.match.targetMarket.yesAsk?.toNumber(),
            latencyMs: opp.match.targetMarket.fetchLatencyMs,
            dataTimestamp: opp.match.targetMarket.lastFetchedAt.toISOString(),
          },
        },
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + opportunities.length < total,
      },
    };

    await cacheService.set(cacheKey, response, 3);

    res.json({
      ...response,
      meta: {
        fetchedAt: new Date().toISOString(),
        cacheHit: false,
        refreshRecommendedIn: 2000,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getArbitrageById: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    const opportunity = await prisma.arbitrageOpportunity.findUnique({
      where: { id },
      include: {
        match: {
          include: {
            sourceMarket: {
              include: {
                priceHistory: {
                  orderBy: { timestamp: 'desc' },
                  take: 50,
                },
              },
            },
            targetMarket: {
              include: {
                priceHistory: {
                  orderBy: { timestamp: 'desc' },
                  take: 50,
                },
              },
            },
          },
        },
      },
    });

    if (!opportunity) {
      throw new AppError(404, 'NOT_FOUND', 'Arbitrage opportunity not found');
    }

    // Get real-time orderbooks from cache
    const sourceOB = await ingestionOrchestrator.getOrderBook(
      opportunity.match.sourceMarket.platform,
      opportunity.match.sourceMarket.externalId
    );
    const targetOB = await ingestionOrchestrator.getOrderBook(
      opportunity.match.targetMarket.platform,
      opportunity.match.targetMarket.externalId
    );

    res.json({
      data: {
        id: opportunity.id,
        matchId: opportunity.matchId,
        strategy: opportunity.strategy,
        profitAnalysis: {
          grossSpread: opportunity.grossSpread.toNumber(),
          netSpread: opportunity.netSpread.toNumber(),
          spreadPercentage: opportunity.spreadPercentage.toNumber(),
          sourceFee: opportunity.sourceFee.toNumber(),
          targetFee: opportunity.targetFee.toNumber(),
          totalFees: opportunity.totalFees.toNumber(),
          estimatedSlippage: opportunity.estimatedSlippage.toNumber(),
          maxExecutableSize: opportunity.maxProfitableSize.toNumber(),
          roi: opportunity.spreadPercentage.toNumber(),
        },
        prices: {
          source: {
            yesPrice: opportunity.sourceYesPrice.toNumber(),
            noPrice: opportunity.sourceNoPrice.toNumber(),
          },
          target: {
            yesPrice: opportunity.targetYesPrice.toNumber(),
            noPrice: opportunity.targetNoPrice.toNumber(),
          },
        },
        confidence: {
          overall: opportunity.confidenceScore.toNumber(),
          freshness: opportunity.freshnessScore.toNumber(),
          liquidity: opportunity.liquidityScore.toNumber(),
          consistency: opportunity.consistencyScore.toNumber(),
          factors: opportunity.confidenceFactors,
        },
        executionPlan: opportunity.executionSteps,
        status: opportunity.status,
        detectedAt: opportunity.detectedAt.toISOString(),
        sourceDataAge: opportunity.sourceDataAge,
        targetDataAge: opportunity.targetDataAge,
        orderbooks: {
          source: sourceOB,
          target: targetOB,
        },
        match: {
          id: opportunity.match.id,
          overallScore: opportunity.match.overallScore.toNumber(),
          matchReason: opportunity.match.matchReason,
          resolutionDiff: opportunity.match.resolutionDiff,
          sourceMarket: {
            id: opportunity.match.sourceMarket.id,
            platform: opportunity.match.sourceMarket.platform,
            externalId: opportunity.match.sourceMarket.externalId,
            question: opportunity.match.sourceMarket.question,
            sourceUrl: opportunity.match.sourceMarket.sourceUrl,
            resolutionRules: opportunity.match.sourceMarket.resolutionRules,
            priceHistory: opportunity.match.sourceMarket.priceHistory.map((p: typeof opportunity.match.sourceMarket.priceHistory[number]) => ({
              timestamp: p.timestamp.toISOString(),
              yesPrice: p.yesPrice.toNumber(),
              yesBid: p.yesBid?.toNumber(),
              yesAsk: p.yesAsk?.toNumber(),
              spread: p.spread?.toNumber(),
              latencyMs: p.fetchLatencyMs,
            })),
          },
          targetMarket: {
            id: opportunity.match.targetMarket.id,
            platform: opportunity.match.targetMarket.platform,
            externalId: opportunity.match.targetMarket.externalId,
            question: opportunity.match.targetMarket.question,
            sourceUrl: opportunity.match.targetMarket.sourceUrl,
            resolutionRules: opportunity.match.targetMarket.resolutionRules,
            priceHistory: opportunity.match.targetMarket.priceHistory.map((p: typeof opportunity.match.targetMarket.priceHistory[number]) => ({
              timestamp: p.timestamp.toISOString(),
              yesPrice: p.yesPrice.toNumber(),
              yesBid: p.yesBid?.toNumber(),
              yesAsk: p.yesAsk?.toNumber(),
              spread: p.spread?.toNumber(),
              latencyMs: p.fetchLatencyMs,
            })),
          },
        },
      },
      auditTrail: {
        detectedAt: opportunity.detectedAt.toISOString(),
        calculation: {
          buyPrice: opportunity.sourceYesPrice.toNumber(),
          sellPrice: opportunity.targetYesPrice.toNumber(),
          grossSpread: opportunity.grossSpread.toNumber(),
          fees: opportunity.totalFees.toNumber(),
          slippage: opportunity.estimatedSlippage.toNumber(),
          netSpread: opportunity.netSpread.toNumber(),
          maxSize: opportunity.maxProfitableSize.toNumber(),
          formula: 'netSpread = sellPrice - buyPrice - fees - slippage',
        },
      },
      meta: { fetchedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

const executionPlanQuerySchema = z.object({
  investmentAmount: z.coerce.number().positive().default(100),
  maxSlippage: z.coerce.number().min(0).max(0.2).default(0.02),
});

export const getExecutionPlan: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { investmentAmount, maxSlippage } = executionPlanQuerySchema.parse(req.query);

    const opportunity = await prisma.arbitrageOpportunity.findUnique({
      where: { id },
      include: {
        match: {
          include: {
            sourceMarket: true,
            targetMarket: true,
          },
        },
      },
    });

    if (!opportunity) {
      throw new AppError(404, 'NOT_FOUND', 'Opportunity not found');
    }

    const strategy = opportunity.strategy as {
      buyPlatform: string;
      sellPlatform: string;
      buyPrice: number;
      sellPrice: number;
    };

    // Calculate execution details
    const buyPrice = new Decimal(strategy.buyPrice);
    const sellPrice = new Decimal(strategy.sellPrice);
    const quantity = new Decimal(investmentAmount).dividedBy(buyPrice).floor();
    const buyFee = buyPrice.times(quantity).times(0.02); // 2% assumed
    const sellFee = sellPrice.times(quantity).times(0.02);
    const totalCost = buyPrice.times(quantity).plus(buyFee);
    const totalRevenue = sellPrice.times(quantity).minus(sellFee);
    const netProfit = totalRevenue.minus(totalCost);
    const roi = netProfit.dividedBy(totalCost).times(100);

    const steps = [
      {
        order: 1,
        platform: strategy.buyPlatform,
        action: 'BUY',
        outcome: 'YES',
        quantity: quantity.toNumber(),
        limitPrice: buyPrice.toNumber(),
        expectedCost: totalCost.toNumber(),
        fee: buyFee.toNumber(),
        url: opportunity.match.sourceMarket.sourceUrl,
        instructions: `Place limit buy order for ${quantity.toNumber()} YES shares at $${buyPrice.toFixed(3)} or better on ${strategy.buyPlatform}`,
      },
      {
        order: 2,
        platform: strategy.sellPlatform,
        action: 'SELL',
        outcome: 'YES',
        quantity: quantity.toNumber(),
        limitPrice: sellPrice.toNumber(),
        expectedRevenue: totalRevenue.toNumber(),
        fee: sellFee.toNumber(),
        url: opportunity.match.targetMarket.sourceUrl,
        instructions: `Place limit sell order for ${quantity.toNumber()} YES shares at $${sellPrice.toFixed(3)} or better on ${strategy.sellPlatform}`,
      },
    ];

    res.json({
      opportunityId: id,
      investmentAmount,
      steps,
      summary: {
        totalCost: totalCost.toNumber(),
        totalRevenue: totalRevenue.toNumber(),
        expectedProfit: netProfit.toNumber(),
        roi: roi.toNumber(),
        breakEvenPrice: buyPrice.plus(buyFee.dividedBy(quantity)).plus(sellFee.dividedBy(quantity)).toNumber(),
      },
      risks: [
        'Prices may move between placing orders on each platform',
        'One leg may fill while the other does not (partial fill risk)',
        'Slippage may reduce actual profit',
        `Market data is ${Math.max(opportunity.sourceDataAge, opportunity.targetDataAge)}ms old`,
      ],
      meta: { generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

export const getPartialFillScenarios: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    const opportunity = await prisma.arbitrageOpportunity.findUnique({
      where: { id },
    });

    if (!opportunity) {
      throw new AppError(404, 'NOT_FOUND', 'Opportunity not found');
    }

    const maxSize = opportunity.maxProfitableSize.toNumber();
    const netSpread = opportunity.netSpread.toNumber();
    const roi = opportunity.spreadPercentage.toNumber();

    const scenarios = [25, 50, 60, 75, 100].map((pct) => {
      const filledQty = maxSize * (pct / 100);
      const adjustedProfit = netSpread * filledQty;

      let risk: 'LOW' | 'MEDIUM' | 'HIGH';
      let recommendation: string;

      if (pct === 100) {
        risk = 'LOW';
        recommendation = 'Full execution - maximum profit potential';
      } else if (pct >= 75) {
        risk = 'LOW';
        recommendation = 'Still very profitable - consider completing second leg';
      } else if (pct >= 50) {
        risk = 'MEDIUM';
        recommendation = 'Profitable but consider hedging unmatched portion';
      } else {
        risk = 'HIGH';
        recommendation = 'Significant unmatched exposure - may need to exit at loss on remaining';
      }

      return {
        fillPercentage: pct,
        filledQuantity: filledQty,
        unfilledQuantity: maxSize - filledQty,
        adjustedProfit,
        adjustedRoi: roi,
        risk,
        recommendation,
        worstCase: pct < 50 ? 'May need to sell remaining at market price' : null,
      };
    });

    res.json({
      opportunityId: id,
      maxExecutableSize: maxSize,
      scenarios,
      guidance: {
        general: 'Partial fills occur when one leg executes but the other does not fully fill',
        mitigation: 'Consider using smaller order sizes or limit orders with wider spreads',
        timing: 'Execute both legs as simultaneously as possible',
      },
      meta: { generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};
