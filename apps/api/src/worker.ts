import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { ingestionOrchestrator } from './services/ingestion/IngestionOrchestrator.js';
import { marketMatcher } from './services/matching/MarketMatcher.js';
import { arbitrageDetector } from './services/arbitrage/ArbitrageDetector.js';

let isShuttingDown = false;

async function runArbitrageScan(): Promise<void> {
  while (!isShuttingDown) {
    try {
      const opportunities = await arbitrageDetector.scanForOpportunities();

      for (const opp of opportunities) {
        try {
          await arbitrageDetector.saveOpportunity(opp);
          logger.info(`Saved opportunity: ${opp.id} with ${(opp.profitAnalysis.roi * 100).toFixed(2)}% ROI`);
        } catch (error) {
          logger.error('Failed to save opportunity', error as Error);
        }
      }

      // Wait before next scan
      await new Promise((resolve) => setTimeout(resolve, env.ARBITRAGE_SCAN_INTERVAL_MS));
    } catch (error) {
      logger.error('Arbitrage scan error', error as Error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function runMatchingJob(): Promise<void> {
  while (!isShuttingDown) {
    try {
      await marketMatcher.runMatching();
      logger.info('Market matching completed');

      // Run less frequently
      await new Promise((resolve) => setTimeout(resolve, env.MATCHING_INTERVAL_MS));
    } catch (error) {
      logger.error('Matching job error', error as Error);
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
}

async function main(): Promise<void> {
  logger.info('Starting worker process...');

  try {
    // Connect to database
    await connectDatabase();

    // Start ingestion orchestrator
    await ingestionOrchestrator.start();

    // Start background jobs
    runArbitrageScan();
    runMatchingJob();

    logger.info('Worker started successfully');

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`${signal} received, shutting down worker...`);

      await ingestionOrchestrator.stop();
      await disconnectDatabase();
      await disconnectRedis();

      logger.info('Worker shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Worker startup failed', error as Error);
    process.exit(1);
  }
}

main();
