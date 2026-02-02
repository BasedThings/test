import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../config/database.js';
import { cacheService } from '../services/cache/CacheService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ingestionOrchestrator } from '../services/ingestion/IngestionOrchestrator.js';

const marketsQuerySchema = z.object({
  platform: z.enum(['POLYMARKET', 'KALSHI', 'all']).default('all'),
  status: z.enum(['ACTIVE', 'CLOSED', 'all']).default('ACTIVE'),
  category: z.string().optional(),
  search: z.string().optional(),
  minLiquidity: z.coerce.number().optional(),
  sortBy: z.enum(['liquidity', 'volume', 'yesPrice', 'spread', 'updatedAt']).default('liquidity'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type MarketsQuery = z.infer<typeof marketsQuerySchema>;

export const getMarkets: RequestHandler = async (req, res, next) => {
  try {
    const query = marketsQuerySchema.parse(req.query);

    const cacheKey = `markets:${JSON.stringify(query)}`;
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      res.json({
        ...cached,
        meta: { fetchedAt: new Date().toISOString(), cacheHit: true },
      });
      return;
    }

    const where: Record<string, unknown> = {};

    if (query.platform !== 'all') {
      where.platform = query.platform;
    }

    if (query.status !== 'all') {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search) {
      where.question = { contains: query.search, mode: 'insensitive' };
    }

    if (query.minLiquidity) {
      where.liquidity = { gte: query.minLiquidity };
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[query.sortBy] = query.sortOrder;

    const [markets, total] = await Promise.all([
      prisma.market.findMany({
        where,
        orderBy,
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          platform: true,
          externalId: true,
          question: true,
          yesPrice: true,
          noPrice: true,
          spread: true,
          liquidity: true,
          volume24h: true,
          status: true,
          category: true,
          lastFetchedAt: true,
          sourceUrl: true,
        },
      }),
      prisma.market.count({ where }),
    ]);

    const response = {
      data: markets.map((m: typeof markets[number]) => ({
        ...m,
        yesPrice: m.yesPrice.toNumber(),
        noPrice: m.noPrice.toNumber(),
        spread: m.spread?.toNumber(),
        liquidity: m.liquidity?.toNumber(),
        volume24h: m.volume24h?.toNumber(),
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + markets.length < total,
      },
    };

    await cacheService.set(cacheKey, response, 10);

    res.json({
      ...response,
      meta: { fetchedAt: new Date().toISOString(), cacheHit: false },
    });
  } catch (error) {
    next(error);
  }
};

export const getMarketById: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
      },
    });

    if (!market) {
      throw new AppError(404, 'NOT_FOUND', 'Market not found');
    }

    res.json({
      data: {
        id: market.id,
        platform: market.platform,
        externalId: market.externalId,
        question: market.question,
        description: market.description,
        category: market.category,
        outcomes: market.outcomes,
        status: market.status,
        endDate: market.endDate,
        resolutionSource: market.resolutionSource,
        resolutionRules: market.resolutionRules,
        sourceUrl: market.sourceUrl,
        lastFetchedAt: market.lastFetchedAt,
        fetchLatencyMs: market.fetchLatencyMs,
        yesPrice: market.yesPrice.toNumber(),
        noPrice: market.noPrice.toNumber(),
        yesBid: market.yesBid?.toNumber(),
        yesAsk: market.yesAsk?.toNumber(),
        noBid: market.noBid?.toNumber(),
        noAsk: market.noAsk?.toNumber(),
        spread: market.spread?.toNumber(),
        midpoint: market.midpoint?.toNumber(),
        liquidity: market.liquidity?.toNumber(),
        volume24h: market.volume24h?.toNumber(),
        volumeTotal: market.volumeTotal?.toNumber(),
        feeRate: market.feeRate.toNumber(),
        minOrderSize: market.minOrderSize.toNumber(),
        tickSize: market.tickSize.toNumber(),
        priceHistory: market.priceHistory.map((p: typeof market.priceHistory[number]) => ({
          timestamp: p.timestamp.toISOString(),
          yesPrice: p.yesPrice.toNumber(),
          noPrice: p.noPrice.toNumber(),
          yesBid: p.yesBid?.toNumber(),
          yesAsk: p.yesAsk?.toNumber(),
          noBid: p.noBid?.toNumber(),
          noAsk: p.noAsk?.toNumber(),
          spread: p.spread?.toNumber(),
          liquidity: p.liquidity?.toNumber(),
          volume: p.volume?.toNumber(),
          latencyMs: p.fetchLatencyMs,
        })),
      },
      meta: { fetchedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

export const getMarketOrderbook: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get market info first
    const market = await prisma.market.findUnique({
      where: { id },
      select: {
        id: true,
        platform: true,
        externalId: true,
        question: true,
        orderBookDepth: true,
        lastFetchedAt: true,
        fetchLatencyMs: true,
      },
    });

    if (!market) {
      throw new AppError(404, 'NOT_FOUND', 'Market not found');
    }

    // Get real-time orderbook from Redis cache
    const orderbook = await ingestionOrchestrator.getOrderBook(
      market.platform,
      market.externalId
    );

    if (!orderbook) {
      // Fall back to stored orderbook depth if available
      if (market.orderBookDepth) {
        res.json({
          data: {
            marketId: market.id,
            platform: market.platform,
            externalId: market.externalId,
            ...(market.orderBookDepth as object),
            isCached: true,
            cacheAge: market.lastFetchedAt
              ? Date.now() - market.lastFetchedAt.getTime()
              : null,
          },
          meta: {
            fetchedAt: new Date().toISOString(),
            source: 'database',
            warning: 'Real-time orderbook unavailable, using cached data',
          },
        });
        return;
      }

      throw new AppError(503, 'UNAVAILABLE', 'Orderbook data not available');
    }

    res.json({
      data: {
        marketId: market.id,
        platform: orderbook.platform,
        externalId: orderbook.externalId,
        bestBid: orderbook.bestBid,
        bestAsk: orderbook.bestAsk,
        midpoint: orderbook.midpoint,
        spread: orderbook.spread,
        bids: orderbook.bids,
        asks: orderbook.asks,
        timestamp: orderbook.timestamp,
        latencyMs: orderbook.latencyMs,
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        source: 'realtime',
        dataAge: Date.now() - new Date(orderbook.timestamp).getTime(),
      },
    });
  } catch (error) {
    next(error);
  }
};
