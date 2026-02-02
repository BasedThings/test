import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import type {
  Platform,
  NormalizedMarket,
  NormalizedQuote,
  PlatformHealth,
} from '../../../lib/types.js';

const PREDICTIT_API = 'https://www.predictit.org/api/marketdata';

interface PredictItMarket {
  id: number;
  name: string;
  shortName: string;
  image: string;
  url: string;
  contracts: PredictItContract[];
  timeStamp: string;
  status: string;
}

interface PredictItContract {
  id: number;
  dateEnd: string;
  image: string;
  name: string;
  shortName: string;
  status: string;
  lastTradePrice: number;
  bestBuyYesCost: number;
  bestBuyNoCost: number;
  bestSellYesCost: number;
  bestSellNoCost: number;
  lastClosePrice: number;
  displayOrder: number;
}

export class PredictItClient extends EventEmitter {
  private readonly platform: Platform = 'PREDICTIT';
  private readonly http: AxiosInstance;
  private health: PlatformHealth;
  private latencies: number[] = [];
  private pollInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.http = axios.create({
      baseURL: PREDICTIT_API,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ArbitrageScanner/1.0',
      },
    });

    this.health = {
      platform: this.platform,
      status: 'OFFLINE',
      lastSuccessAt: null,
      lastErrorAt: null,
      consecutiveErrors: 0,
      avgLatencyMs: 0,
      lastLatencyMs: 0,
    };
  }

  getHealth(): PlatformHealth {
    return { ...this.health };
  }

  private recordSuccess(latencyMs: number): void {
    this.health.status = 'HEALTHY';
    this.health.lastSuccessAt = new Date();
    this.health.consecutiveErrors = 0;
    this.health.lastLatencyMs = latencyMs;
    this.latencies.push(latencyMs);
    if (this.latencies.length > 100) this.latencies.shift();
    this.health.avgLatencyMs = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  private recordError(error: Error): void {
    this.health.lastErrorAt = new Date();
    this.health.consecutiveErrors++;
    if (this.health.consecutiveErrors >= 3) {
      this.health.status = 'DEGRADED';
    }
    if (this.health.consecutiveErrors >= 10) {
      this.health.status = 'OFFLINE';
    }
    logger.error(`PredictIt error: ${error.message}`);
  }

  async fetchAllMarkets(): Promise<{ markets: NormalizedMarket[]; quotes: NormalizedQuote[] }> {
    const startTime = Date.now();
    try {
      const response = await this.http.get('/all');
      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const data: { markets: PredictItMarket[] } = response.data;
      const markets: NormalizedMarket[] = [];
      const quotes: NormalizedQuote[] = [];

      for (const market of data.markets) {
        if (market.status !== 'Open') continue;

        for (const contract of market.contracts) {
          if (contract.status !== 'Open') continue;

          // Each contract is effectively a binary market
          markets.push({
            platform: this.platform,
            externalId: `${market.id}-${contract.id}`,
            question: `${market.name}: ${contract.name}`,
            description: null,
            category: null,
            outcomes: ['Yes', 'No'],
            endDate: contract.dateEnd ? new Date(contract.dateEnd) : null,
            resolutionSource: 'PredictIt',
            resolutionRules: null,
            volume: null,
            liquidity: null,
            feeRate: 0.10, // PredictIt 10% profit fee
            minOrderSize: 1, // $1 minimum
            tickSize: 0.01,
            sourceUrl: market.url,
            lastUpdated: new Date(),
            latencyMs,
          });

          quotes.push({
            platform: this.platform,
            marketId: `${market.id}-${contract.id}`,
            externalId: contract.id.toString(),
            outcome: 'YES',
            bestBid: contract.bestSellYesCost ? contract.bestSellYesCost / 100 : null,
            bestAsk: contract.bestBuyYesCost ? contract.bestBuyYesCost / 100 : null,
            lastPrice: contract.lastTradePrice ? contract.lastTradePrice / 100 : null,
            bidSize: null, // PredictIt doesn't provide depth
            askSize: null,
            volume24h: null,
            timestamp: new Date(market.timeStamp),
            latencyMs,
          });
        }
      }

      logger.info(`Fetched ${markets.length} PredictIt contracts in ${latencyMs}ms`);
      return { markets, quotes };
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  startPolling(intervalMs: number = 30000): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // PredictIt has aggressive rate limiting, so we poll less frequently
    this.pollInterval = setInterval(async () => {
      try {
        const { markets, quotes } = await this.fetchAllMarkets();

        for (const quote of quotes) {
          this.emit('price', {
            platform: this.platform,
            data: quote,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error('PredictIt polling error', error as Error);
      }
    }, intervalMs);

    logger.info('PredictIt polling started');
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  disconnect(): void {
    this.stopPolling();
  }
}

export const predictItClient = new PredictItClient();
