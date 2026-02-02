import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { Prisma } from '@prisma/client';

import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';
import { polymarketClient, PolymarketClient } from './platforms/PolymarketClient.js';
import { kalshiClient, KalshiClient } from './platforms/KalshiClient.js';
import { predictItClient, PredictItClient } from './platforms/PredictItClient.js';
import type {
  Platform,
  NormalizedMarket,
  NormalizedOrderBook,
  NormalizedQuote,
  PlatformHealth,
} from '../../lib/types.js';

interface IngestionStats {
  marketsIngested: number;
  orderbooksUpdated: number;
  quotesUpdated: number;
  errorsCount: number;
  lastFullSyncAt: Date | null;
}

export class IngestionOrchestrator extends EventEmitter {
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private orderbookInterval: NodeJS.Timeout | null = null;
  private stats: IngestionStats = {
    marketsIngested: 0,
    orderbooksUpdated: 0,
    quotesUpdated: 0,
    errorsCount: 0,
    lastFullSyncAt: null,
  };

  // Rate limiters per platform
  private readonly polyLimit = pLimit(10);
  private readonly kalshiLimit = pLimit(5);

  getStats(): IngestionStats {
    return { ...this.stats };
  }

  getPlatformHealth(): Record<Platform, PlatformHealth> {
    return {
      POLYMARKET: polymarketClient.getHealth(),
      KALSHI: kalshiClient.getHealth(),
      PREDICTIT: predictItClient.getHealth(),
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Starting ingestion orchestrator...');

    // Initial full sync
    await this.fullSync();

    // Set up WebSocket connections for Polymarket
    if (env.ENABLE_POLYMARKET) {
      polymarketClient.connectWebSocket();
      this.setupPolymarketListeners();
    }

    // Start polling for Kalshi
    if (env.ENABLE_KALSHI) {
      this.startKalshiPolling();
    }

    // Start polling for PredictIt (optional)
    if (env.ENABLE_PREDICTIT) {
      predictItClient.startPolling(60000); // 1 minute interval
      this.setupPredictItListeners();
    }

    // Periodic full sync every 5 minutes
    this.syncInterval = setInterval(() => {
      this.fullSync().catch((err) => {
        logger.error('Full sync failed', err);
        this.stats.errorsCount++;
      });
    }, 300000);

    // High-frequency orderbook updates for matched markets
    this.orderbookInterval = setInterval(() => {
      this.updateMatchedMarketOrderbooks().catch((err) => {
        logger.error('Orderbook update failed', err);
        this.stats.errorsCount++;
      });
    }, env.INGESTION_INTERVAL_MS);

    logger.info('Ingestion orchestrator started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.orderbookInterval) {
      clearInterval(this.orderbookInterval);
      this.orderbookInterval = null;
    }

    polymarketClient.disconnect();
    kalshiClient.disconnect();
    predictItClient.disconnect();

    logger.info('Ingestion orchestrator stopped');
  }

  private setupPolymarketListeners(): void {
    polymarketClient.on('orderbook', async (event) => {
      try {
        await this.processOrderbookUpdate(event.data);
        this.stats.orderbooksUpdated++;
        this.emit('orderbookUpdate', event);
      } catch (error) {
        logger.error('Failed to process Polymarket orderbook', error as Error);
        this.stats.errorsCount++;
      }
    });

    polymarketClient.on('price', async (event) => {
      try {
        await this.processPriceUpdate('POLYMARKET', event.data);
        this.stats.quotesUpdated++;
        this.emit('priceUpdate', event);
      } catch (error) {
        logger.error('Failed to process Polymarket price', error as Error);
        this.stats.errorsCount++;
      }
    });
  }

  private setupPredictItListeners(): void {
    predictItClient.on('price', async (event) => {
      try {
        await this.processPriceUpdate('PREDICTIT', event.data);
        this.stats.quotesUpdated++;
        this.emit('priceUpdate', event);
      } catch (error) {
        logger.error('Failed to process PredictIt price', error as Error);
        this.stats.errorsCount++;
      }
    });
  }

  private async startKalshiPolling(): Promise<void> {
    // Get active Kalshi markets from DB
    const kalshiMarkets = await prisma.market.findMany({
      where: {
        platform: 'KALSHI',
        status: 'ACTIVE',
      },
      select: { externalId: true },
      take: 100, // Top 100 most active
    });

    const tickers = kalshiMarkets.map((m: typeof kalshiMarkets[number]) => m.externalId);
    kalshiClient.startPolling(tickers, env.INGESTION_INTERVAL_MS);

    kalshiClient.on('orderbook', async (event) => {
      try {
        await this.processOrderbookUpdate(event.data);
        this.stats.orderbooksUpdated++;
        this.emit('orderbookUpdate', event);
      } catch (error) {
        logger.error('Failed to process Kalshi orderbook', error as Error);
        this.stats.errorsCount++;
      }
    });

    kalshiClient.on('price', async (event) => {
      try {
        await this.processPriceUpdate('KALSHI', event.data);
        this.stats.quotesUpdated++;
        this.emit('priceUpdate', event);
      } catch (error) {
        logger.error('Failed to process Kalshi price', error as Error);
        this.stats.errorsCount++;
      }
    });
  }

  async fullSync(): Promise<void> {
    logger.info('Starting full market sync...');
    const startTime = Date.now();

    try {
      // Sync markets from all enabled platforms
      const syncPromises: Promise<void>[] = [];

      if (env.ENABLE_POLYMARKET) {
        syncPromises.push(this.syncPolymarketMarkets());
      }

      if (env.ENABLE_KALSHI) {
        syncPromises.push(this.syncKalshiMarkets());
      }

      if (env.ENABLE_PREDICTIT) {
        syncPromises.push(this.syncPredictItMarkets());
      }

      await Promise.allSettled(syncPromises);

      this.stats.lastFullSyncAt = new Date();
      logger.info(`Full sync completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      logger.error('Full sync error', error as Error);
      this.stats.errorsCount++;
    }
  }

  private async syncPolymarketMarkets(): Promise<void> {
    const markets = await polymarketClient.fetchActiveMarkets();

    for (const market of markets) {
      await this.upsertMarket(market);
    }

    this.stats.marketsIngested += markets.length;
    logger.info(`Synced ${markets.length} Polymarket markets`);
  }

  private async syncKalshiMarkets(): Promise<void> {
    const markets = await kalshiClient.fetchActiveMarkets();

    for (const market of markets) {
      await this.upsertMarket(market);
    }

    this.stats.marketsIngested += markets.length;
    logger.info(`Synced ${markets.length} Kalshi markets`);
  }

  private async syncPredictItMarkets(): Promise<void> {
    const { markets, quotes } = await predictItClient.fetchAllMarkets();

    for (const market of markets) {
      await this.upsertMarket(market);
    }

    for (const quote of quotes) {
      await this.processPriceUpdate('PREDICTIT', quote);
    }

    this.stats.marketsIngested += markets.length;
    logger.info(`Synced ${markets.length} PredictIt contracts`);
  }

  private async upsertMarket(market: NormalizedMarket): Promise<void> {
    await prisma.market.upsert({
      where: {
        platform_externalId: {
          platform: market.platform,
          externalId: market.externalId,
        },
      },
      create: {
        platform: market.platform,
        externalId: market.externalId,
        question: market.question,
        description: market.description,
        category: market.category,
        outcomes: market.outcomes,
        endDate: market.endDate,
        resolutionSource: market.resolutionSource,
        resolutionRules: market.resolutionRules,
        volumeTotal: market.volume,
        liquidity: market.liquidity,
        feeRate: market.feeRate,
        minOrderSize: market.minOrderSize,
        tickSize: market.tickSize,
        sourceUrl: market.sourceUrl,
        lastFetchedAt: market.lastUpdated,
        fetchLatencyMs: market.latencyMs,
        yesPrice: 0.5, // Placeholder until quotes update
        noPrice: 0.5,
        status: 'ACTIVE',
      },
      update: {
        question: market.question,
        description: market.description,
        category: market.category,
        endDate: market.endDate,
        resolutionRules: market.resolutionRules,
        volumeTotal: market.volume,
        liquidity: market.liquidity,
        sourceUrl: market.sourceUrl,
        lastFetchedAt: market.lastUpdated,
        fetchLatencyMs: market.latencyMs,
      },
    });
  }

  private async processOrderbookUpdate(orderbook: NormalizedOrderBook): Promise<void> {
    const redis = getRedis();

    // Store in Redis for real-time access
    const key = `orderbook:${orderbook.platform}:${orderbook.externalId}`;
    await redis.set(key, JSON.stringify(orderbook), 'EX', 10); // 10 second TTL

    // Update market prices from orderbook
    if (orderbook.bestBid !== null || orderbook.bestAsk !== null) {
      await prisma.market.updateMany({
        where: {
          platform: orderbook.platform,
          externalId: orderbook.externalId,
        },
        data: {
          yesBid: orderbook.bestBid,
          yesAsk: orderbook.bestAsk,
          midpoint: orderbook.midpoint,
          spread: orderbook.spread,
          yesPrice: orderbook.midpoint || orderbook.bestBid || orderbook.bestAsk || 0.5,
          noPrice: 1 - (orderbook.midpoint || orderbook.bestBid || orderbook.bestAsk || 0.5),
          lastFetchedAt: orderbook.timestamp,
          fetchLatencyMs: orderbook.latencyMs,
          orderBookDepth: {
            bids: orderbook.bids.slice(0, 10).map(b => ({ price: b.price, size: b.size })),
            asks: orderbook.asks.slice(0, 10).map(a => ({ price: a.price, size: a.size })),
            timestamp: orderbook.timestamp.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    // Store price snapshot
    const market = await prisma.market.findFirst({
      where: {
        platform: orderbook.platform,
        externalId: orderbook.externalId,
      },
      select: { id: true },
    });

    if (market) {
      await prisma.priceSnapshot.create({
        data: {
          marketId: market.id,
          yesPrice: orderbook.midpoint || orderbook.bestBid || 0.5,
          noPrice: 1 - (orderbook.midpoint || orderbook.bestBid || 0.5),
          yesBid: orderbook.bestBid,
          yesAsk: orderbook.bestAsk,
          spread: orderbook.spread,
          fetchLatencyMs: orderbook.latencyMs,
        },
      });
    }
  }

  private async processPriceUpdate(platform: Platform, quote: NormalizedQuote): Promise<void> {
    const redis = getRedis();

    // Store in Redis
    const key = `quote:${platform}:${quote.externalId}`;
    await redis.set(key, JSON.stringify(quote), 'EX', 10);

    // Update market
    await prisma.market.updateMany({
      where: {
        platform,
        externalId: quote.marketId,
      },
      data: {
        yesBid: quote.bestBid,
        yesAsk: quote.bestAsk,
        yesPrice: quote.lastPrice || quote.bestBid || quote.bestAsk || 0.5,
        noPrice: 1 - (quote.lastPrice || quote.bestBid || quote.bestAsk || 0.5),
        volume24h: quote.volume24h,
        lastFetchedAt: quote.timestamp,
        fetchLatencyMs: quote.latencyMs,
      },
    });
  }

  private async updateMatchedMarketOrderbooks(): Promise<void> {
    // Get markets that are part of confirmed matches
    const matchedMarkets = await prisma.marketMatch.findMany({
      where: { status: 'CONFIRMED' },
      select: {
        sourceMarket: { select: { platform: true, externalId: true } },
        targetMarket: { select: { platform: true, externalId: true } },
      },
    });

    const marketSet = new Set<string>();
    for (const match of matchedMarkets) {
      marketSet.add(`${match.sourceMarket.platform}:${match.sourceMarket.externalId}`);
      marketSet.add(`${match.targetMarket.platform}:${match.targetMarket.externalId}`);
    }

    // Fetch orderbooks for matched markets
    for (const key of marketSet) {
      const [platform, externalId] = key.split(':');

      try {
        if (platform === 'POLYMARKET') {
          await this.polyLimit(() => polymarketClient.fetchOrderBook(externalId));
        } else if (platform === 'KALSHI') {
          await this.kalshiLimit(() => kalshiClient.fetchOrderBook(externalId));
        }
      } catch (error) {
        logger.error(`Failed to update orderbook for ${key}`, error as Error);
      }
    }
  }

  // Get real-time orderbook from cache
  async getOrderBook(platform: Platform, externalId: string): Promise<NormalizedOrderBook | null> {
    const redis = getRedis();
    const key = `orderbook:${platform}:${externalId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}

export const ingestionOrchestrator = new IngestionOrchestrator();
