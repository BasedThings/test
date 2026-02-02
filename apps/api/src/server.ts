import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import app from './app.js';
import { env, isProduction } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { ingestionOrchestrator } from './services/ingestion/IngestionOrchestrator.js';
import { marketMatcher } from './services/matching/MarketMatcher.js';
import { arbitrageDetector } from './services/arbitrage/ArbitrageDetector.js';

let isShuttingDown = false;
let io: SocketIOServer;

// Background job: scan for arbitrage opportunities
async function runArbitrageScan(): Promise<void> {
  // Wait for initial data
  await new Promise((resolve) => setTimeout(resolve, 10000));

  while (!isShuttingDown) {
    try {
      const opportunities = await arbitrageDetector.scanForOpportunities();

      for (const opp of opportunities) {
        try {
          await arbitrageDetector.saveOpportunity(opp);

          // Emit to connected clients
          if (io) {
            io.to('arbitrage').emit('newOpportunity', {
              id: opp.id,
              matchId: opp.matchId,
              roi: opp.profitAnalysis.roi,
              netProfit: opp.profitAnalysis.netProfit,
              confidence: opp.confidence.overall,
              sourceMarket: opp.sourceMarket,
              targetMarket: opp.targetMarket,
            });
          }

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

// Background job: match markets across platforms
async function runMatchingJob(): Promise<void> {
  // Wait for initial data
  await new Promise((resolve) => setTimeout(resolve, 30000));

  while (!isShuttingDown) {
    try {
      await marketMatcher.runMatching();
      logger.info('Market matching completed');

      // Run less frequently (every 5 minutes)
      await new Promise((resolve) => setTimeout(resolve, env.MATCHING_INTERVAL_MS));
    } catch (error) {
      logger.error('Matching job error', error as Error);
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
}

async function main() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Create HTTP server
    const httpServer = createServer(app);

    // Set up Socket.IO for real-time updates
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: isProduction
          ? (env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : true) // true allows all origins
          : ['http://localhost:5173', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Subscribe to arbitrage updates
      socket.on('subscribe:arbitrage', () => {
        socket.join('arbitrage');
        logger.debug(`${socket.id} subscribed to arbitrage updates`);
      });

      // Subscribe to specific market updates
      socket.on('subscribe:market', (marketId: string) => {
        socket.join(`market:${marketId}`);
        logger.debug(`${socket.id} subscribed to market ${marketId}`);
      });

      // Unsubscribe
      socket.on('unsubscribe:arbitrage', () => {
        socket.leave('arbitrage');
      });

      socket.on('unsubscribe:market', (marketId: string) => {
        socket.leave(`market:${marketId}`);
      });

      socket.on('disconnect', () => {
        logger.debug(`Client disconnected: ${socket.id}`);
      });
    });

    // Forward ingestion events to Socket.IO clients
    ingestionOrchestrator.on('priceUpdate', (event) => {
      io.to('arbitrage').emit('price', event);
    });

    ingestionOrchestrator.on('orderbookUpdate', (event) => {
      io.to(`market:${event.data?.marketId}`).emit('orderbook', event);
      io.to('arbitrage').emit('orderbook', event);
    });

    // Start data ingestion
    logger.info('Starting data ingestion...');
    await ingestionOrchestrator.start();

    // Start background scanning jobs
    runArbitrageScan();
    runMatchingJob();

    // Start HTTP server
    httpServer.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`, {
        environment: env.NODE_ENV,
        port: env.PORT,
        platforms: {
          polymarket: env.ENABLE_POLYMARKET,
          kalshi: env.ENABLE_KALSHI,
          predictit: env.ENABLE_PREDICTIT,
        },
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`${signal} received, shutting down gracefully...`);

      // Stop ingestion
      await ingestionOrchestrator.stop();

      // Close Socket.IO connections
      io.close();

      httpServer.close(async () => {
        logger.info('HTTP server closed');

        await Promise.all([
          disconnectDatabase(),
          disconnectRedis(),
        ]);

        logger.info('All connections closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

main();
