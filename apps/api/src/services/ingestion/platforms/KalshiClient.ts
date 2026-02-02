import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import type {
  Platform,
  NormalizedMarket,
  NormalizedOrderBook,
  NormalizedQuote,
  RawOrderBookLevel,
  PlatformHealth,
} from '../../../lib/types.js';

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  settlement_timer_seconds: number;
  status: string;
  response_price_units: string;
  notional_value: number;
  tick_size: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_yes_bid: number;
  previous_yes_ask: number;
  previous_price: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  result: string;
  cap_strike: number;
  category: string;
  rules_primary: string;
  rules_secondary: string;
}

interface KalshiOrderBook {
  orderbook: {
    yes: Array<[number, number]>; // [price, contracts]
    no: Array<[number, number]>;
  };
  market_ticker: string;
}

export class KalshiClient extends EventEmitter {
  private readonly platform: Platform = 'KALSHI';
  private readonly http: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private health: PlatformHealth;
  private latencies: number[] = [];
  private pollInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.http = axios.create({
      baseURL: KALSHI_API,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
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
    logger.error(`Kalshi error: ${error.message}`);
  }

  private async authenticate(): Promise<void> {
    if (!env.KALSHI_API_EMAIL || !env.KALSHI_API_PASSWORD) {
      logger.warn('Kalshi API credentials not configured, using public endpoints only');
      return;
    }

    if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return;
    }

    try {
      const response = await this.http.post('/login', {
        email: env.KALSHI_API_EMAIL,
        password: env.KALSHI_API_PASSWORD,
      });

      this.authToken = response.data.token;
      this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000); // 25 min expiry
      this.http.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
      logger.info('Kalshi authenticated successfully');
    } catch (error) {
      logger.error('Kalshi authentication failed', error as Error);
      this.authToken = null;
    }
  }

  async fetchActiveMarkets(): Promise<NormalizedMarket[]> {
    const startTime = Date.now();
    try {
      await this.authenticate();

      // Fetch markets with cursor pagination
      const allMarkets: KalshiMarket[] = [];
      let cursor: string | null = null;

      do {
        const params: Record<string, unknown> = {
          limit: 200,
          status: 'open',
        };
        if (cursor) params.cursor = cursor;

        const response = await this.http.get('/markets', { params });
        allMarkets.push(...response.data.markets);
        cursor = response.data.cursor || null;
      } while (cursor);

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const markets: NormalizedMarket[] = allMarkets.map((market) => ({
        platform: this.platform,
        externalId: market.ticker,
        question: market.title,
        description: market.subtitle || null,
        category: market.category || null,
        outcomes: ['Yes', 'No'],
        endDate: market.expiration_time ? new Date(market.expiration_time) : null,
        resolutionSource: 'Kalshi',
        resolutionRules: `${market.rules_primary || ''}\n${market.rules_secondary || ''}`.trim() || null,
        volume: market.volume || 0,
        liquidity: market.liquidity || 0,
        feeRate: 0.01, // Kalshi fee (varies, using base)
        minOrderSize: 1, // 1 contract minimum
        tickSize: market.tick_size / 100, // Convert cents to dollars
        sourceUrl: `https://kalshi.com/markets/${market.ticker}`,
        lastUpdated: new Date(),
        latencyMs,
      }));

      logger.info(`Fetched ${markets.length} active Kalshi markets in ${latencyMs}ms`);
      return markets;
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  async fetchOrderBook(ticker: string): Promise<NormalizedOrderBook | null> {
    const startTime = Date.now();
    try {
      await this.authenticate();

      const response = await this.http.get(`/markets/${ticker}/orderbook`, {
        params: { depth: 20 },
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const data: KalshiOrderBook = response.data;

      // Kalshi prices are in cents (0-100), convert to probability (0-1)
      const bids: RawOrderBookLevel[] = (data.orderbook.yes || [])
        .map(([price, size]) => ({
          price: price / 100, // Convert cents to probability
          size: size, // Number of contracts (each $1)
        }))
        .sort((a, b) => b.price - a.price);

      // For asks, we look at the NO side inversely
      const asks: RawOrderBookLevel[] = (data.orderbook.no || [])
        .map(([price, size]) => ({
          price: 1 - price / 100, // YES ask = 1 - NO bid
          size: size,
        }))
        .sort((a, b) => a.price - b.price);

      const bestBid = bids[0]?.price ?? null;
      const bestAsk = asks[0]?.price ?? null;
      const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
      const spread = bestBid && bestAsk ? bestAsk - bestBid : null;

      return {
        platform: this.platform,
        marketId: ticker,
        externalId: ticker,
        timestamp: new Date(),
        latencyMs,
        bids,
        asks,
        bestBid,
        bestAsk,
        midpoint,
        spread,
      };
    } catch (error) {
      this.recordError(error as Error);
      return null;
    }
  }

  async fetchMarketQuote(ticker: string): Promise<NormalizedQuote | null> {
    const startTime = Date.now();
    try {
      await this.authenticate();

      const response = await this.http.get(`/markets/${ticker}`);
      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const market: KalshiMarket = response.data.market;

      return {
        platform: this.platform,
        marketId: ticker,
        externalId: ticker,
        outcome: 'YES',
        bestBid: market.yes_bid / 100,
        bestAsk: market.yes_ask / 100,
        lastPrice: market.last_price / 100,
        bidSize: null,
        askSize: null,
        volume24h: market.volume_24h,
        timestamp: new Date(),
        latencyMs,
      };
    } catch (error) {
      this.recordError(error as Error);
      return null;
    }
  }

  // Polling-based real-time simulation (Kalshi doesn't have public WebSocket)
  startPolling(tickers: string[], intervalMs: number = 2000): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      for (const ticker of tickers) {
        try {
          const [quote, orderbook] = await Promise.all([
            this.fetchMarketQuote(ticker),
            this.fetchOrderBook(ticker),
          ]);

          if (quote) {
            this.emit('price', {
              platform: this.platform,
              data: quote,
              timestamp: new Date(),
            });
          }

          if (orderbook) {
            this.emit('orderbook', {
              platform: this.platform,
              data: orderbook,
              timestamp: new Date(),
            });
          }

          // Rate limiting between requests
          await new Promise((r) => setTimeout(r, 100));
        } catch (error) {
          logger.error(`Polling error for ${ticker}`, error as Error);
        }
      }
    }, intervalMs);

    logger.info(`Kalshi polling started for ${tickers.length} markets`);
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

export const kalshiClient = new KalshiClient();
