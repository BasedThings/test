import type { RequestHandler } from 'express';

import { prisma } from '../config/database.js';
import { checkRedisHealth } from '../config/redis.js';
import { ingestionOrchestrator } from '../services/ingestion/IngestionOrchestrator.js';

export const getHealth: RequestHandler = async (_req, res) => {
  const now = new Date().toISOString();

  const [dbHealthy, redisHealthy] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    checkRedisHealth(),
  ]);

  const platformHealth = ingestionOrchestrator.getPlatformHealth();

  const allHealthy = dbHealthy && redisHealthy &&
    platformHealth.POLYMARKET.status === 'HEALTHY' &&
    platformHealth.KALSHI.status === 'HEALTHY';

  const health = {
    status: allHealthy ? 'ok' : 'degraded',
    timestamp: now,
    services: {
      database: {
        status: dbHealthy ? 'healthy' : 'offline',
        lastSuccessAt: dbHealthy ? now : undefined,
      },
      redis: {
        status: redisHealthy ? 'healthy' : 'offline',
        lastSuccessAt: redisHealthy ? now : undefined,
      },
      polymarket: {
        status: platformHealth.POLYMARKET.status.toLowerCase(),
        lastSuccessAt: platformHealth.POLYMARKET.lastSuccessAt?.toISOString(),
        latencyMs: platformHealth.POLYMARKET.avgLatencyMs,
        errorCount: platformHealth.POLYMARKET.consecutiveErrors,
      },
      kalshi: {
        status: platformHealth.KALSHI.status.toLowerCase(),
        lastSuccessAt: platformHealth.KALSHI.lastSuccessAt?.toISOString(),
        latencyMs: platformHealth.KALSHI.avgLatencyMs,
        errorCount: platformHealth.KALSHI.consecutiveErrors,
      },
      predictit: {
        status: platformHealth.PREDICTIT.status.toLowerCase(),
        lastSuccessAt: platformHealth.PREDICTIT.lastSuccessAt?.toISOString(),
        latencyMs: platformHealth.PREDICTIT.avgLatencyMs,
        errorCount: platformHealth.PREDICTIT.consecutiveErrors,
      },
    },
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
};

export const getStatus: RequestHandler = async (_req, res) => {
  const [marketCounts, pendingMatches, activeOpps] = await Promise.all([
    prisma.market.groupBy({
      by: ['platform'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
    }).catch(() => []),
    prisma.marketMatch.count({
      where: { status: 'PENDING_REVIEW' },
    }).catch(() => 0),
    prisma.arbitrageOpportunity.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { netSpread: 'desc' },
      take: 5,
      select: {
        id: true,
        netSpread: true,
        confidenceScore: true,
        maxProfitableSize: true,
        detectedAt: true,
      },
    }).catch(() => []),
  ]);

  const platformHealth = ingestionOrchestrator.getPlatformHealth();
  const stats = ingestionOrchestrator.getStats();

  const polymarketCount = marketCounts.find(
    (c) => c.platform === 'POLYMARKET'
  )?._count.id ?? 0;

  const kalshiCount = marketCounts.find(
    (c) => c.platform === 'KALSHI'
  )?._count.id ?? 0;

  const predictitCount = marketCounts.find(
    (c) => c.platform === 'PREDICTIT'
  )?._count.id ?? 0;

  const confirmedMatches = await prisma.marketMatch.count({
    where: { status: 'CONFIRMED' },
  }).catch(() => 0);

  res.json({
    platforms: {
      polymarket: {
        status: platformHealth.POLYMARKET.status,
        marketCount: polymarketCount,
        lastFetch: platformHealth.POLYMARKET.lastSuccessAt?.toISOString(),
        avgLatencyMs: platformHealth.POLYMARKET.avgLatencyMs,
      },
      kalshi: {
        status: platformHealth.KALSHI.status,
        marketCount: kalshiCount,
        lastFetch: platformHealth.KALSHI.lastSuccessAt?.toISOString(),
        avgLatencyMs: platformHealth.KALSHI.avgLatencyMs,
      },
      predictit: {
        status: platformHealth.PREDICTIT.status,
        marketCount: predictitCount,
        lastFetch: platformHealth.PREDICTIT.lastSuccessAt?.toISOString(),
        avgLatencyMs: platformHealth.PREDICTIT.avgLatencyMs,
      },
    },
    matching: {
      confirmedMatches,
      pendingReview: pendingMatches,
    },
    arbitrage: {
      activeCount: activeOpps.length,
      topOpportunities: activeOpps.map((o) => ({
        id: o.id,
        spread: o.netSpread.toNumber(),
        confidence: o.confidenceScore.toNumber(),
        maxSize: o.maxProfitableSize.toNumber(),
        ageSeconds: Math.floor((Date.now() - o.detectedAt.getTime()) / 1000),
      })),
    },
    ingestion: {
      marketsIngested: stats.marketsIngested,
      orderbooksUpdated: stats.orderbooksUpdated,
      quotesUpdated: stats.quotesUpdated,
      errorCount: stats.errorsCount,
      lastFullSync: stats.lastFullSyncAt?.toISOString(),
    },
    system: {
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString(),
    },
  });
};

export const getPlatformHealth: RequestHandler = async (_req, res) => {
  const platformHealth = ingestionOrchestrator.getPlatformHealth();

  res.json({
    platforms: Object.entries(platformHealth).map(([platform, health]) => ({
      platform,
      status: health.status,
      lastSuccessAt: health.lastSuccessAt?.toISOString(),
      lastErrorAt: health.lastErrorAt?.toISOString(),
      consecutiveErrors: health.consecutiveErrors,
      avgLatencyMs: Math.round(health.avgLatencyMs),
      lastLatencyMs: health.lastLatencyMs,
    })),
  });
};
