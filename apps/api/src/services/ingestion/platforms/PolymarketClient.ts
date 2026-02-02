import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
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

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

interface PolymarketMarket {
  condition_id: string;
  question_id: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  minimum_order_size: string;
  minimum_tick_size: string;
  description: string;
  category: string;
  end_date_iso: string;
  game_start_time: string;
  question: string;
  market_slug: string;
  active: boolean;
  closed: boolean;
  accepting_orders: boolean;
}

interface PolymarketOrderBook {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  hash: string;
  timestamp: string;
}

export class PolymarketClient extends EventEmitter {
  private readonly platform: Platform = 'POLYMARKET';
  private readonly http: AxiosInstance;
  private readonly gammaHttp: AxiosInstance;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private subscribedMarkets: Set<string> = new Set();
  private health: PlatformHealth;
  private latencies: number[] = [];

  constructor() {
    super();
    this.http = axios.create({
      baseURL: CLOB_API,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.gammaHttp = axios.create({
      baseURL: GAMMA_API,
      timeout: 10000,
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
    logger.error(`Polymarket error: ${error.message}`);
  }

  async fetchActiveMarkets(): Promise<NormalizedMarket[]> {
    const startTime = Date.now();
    try {
      // Fetch from Gamma API for market metadata
      const response = await this.gammaHttp.get('/markets', {
        params: {
          active: true,
          closed: false,
          limit: 500,
        },
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const markets: NormalizedMarket[] = [];

      for (const market of response.data) {
        if (!market.enableOrderBook) continue;

        markets.push({
          platform: this.platform,
          externalId: market.conditionId || market.id,
          question: market.question,
          description: market.description || null,
          category: market.groupItemTitle || market.category || null,
          outcomes: market.outcomes?.map((o: string) => o) || ['Yes', 'No'],
          endDate: market.endDate ? new Date(market.endDate) : null,
          resolutionSource: market.resolutionSource || 'UMA Oracle',
          resolutionRules: market.description || null,
          volume: parseFloat(market.volume || '0'),
          liquidity: parseFloat(market.liquidity || '0'),
          feeRate: 0.02, // Polymarket standard fee
          minOrderSize: parseFloat(market.minimumOrderSize || '5'),
          tickSize: parseFloat(market.minimumTickSize || '0.01'),
          sourceUrl: `https://polymarket.com/event/${market.slug}`,
          lastUpdated: new Date(),
          latencyMs,
        });
      }

      logger.info(`Fetched ${markets.length} active Polymarket markets in ${latencyMs}ms`);
      return markets;
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  async fetchOrderBook(tokenId: string): Promise<NormalizedOrderBook | null> {
    const startTime = Date.now();
    try {
      const response = await this.http.get(`/book`, {
        params: { token_id: tokenId },
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const data: PolymarketOrderBook = response.data;

      const bids: RawOrderBookLevel[] = data.bids
        .map((b) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        }))
        .sort((a, b) => b.price - a.price);

      const asks: RawOrderBookLevel[] = data.asks
        .map((a) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        }))
        .sort((a, b) => a.price - b.price);

      const bestBid = bids[0]?.price ?? null;
      const bestAsk = asks[0]?.price ?? null;
      const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
      const spread = bestBid && bestAsk ? bestAsk - bestBid : null;

      return {
        platform: this.platform,
        marketId: tokenId,
        externalId: tokenId,
        timestamp: new Date(data.timestamp || Date.now()),
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

  async fetchMarketPrices(conditionId: string): Promise<NormalizedQuote[]> {
    const startTime = Date.now();
    try {
      const response = await this.http.get(`/prices`, {
        params: { market: conditionId },
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      const quotes: NormalizedQuote[] = [];

      for (const [tokenId, priceData] of Object.entries(response.data)) {
        const data = priceData as { price?: number; bid?: number; ask?: number };
        quotes.push({
          platform: this.platform,
          marketId: conditionId,
          externalId: tokenId,
          outcome: tokenId.endsWith('1') ? 'YES' : 'NO', // Heuristic
          bestBid: data.bid ?? null,
          bestAsk: data.ask ?? null,
          lastPrice: data.price ?? null,
          bidSize: null,
          askSize: null,
          volume24h: null,
          timestamp: new Date(),
          latencyMs,
        });
      }

      return quotes;
    } catch (error) {
      this.recordError(error as Error);
      return [];
    }
  }

  // WebSocket for real-time updates
  connectWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    logger.info('Connecting to Polymarket WebSocket...');

    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      logger.info('Polymarket WebSocket connected');
      this.health.status = 'HEALTHY';
      this.resubscribeAll();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWsMessage(message);
      } catch (error) {
        logger.error('Failed to parse Polymarket WS message', error as Error);
      }
    });

    this.ws.on('close', () => {
      logger.warn('Polymarket WebSocket closed, reconnecting in 5s...');
      this.health.status = 'DEGRADED';
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      logger.error('Polymarket WebSocket error', error);
      this.recordError(error);
    });
  }

  private handleWsMessage(message: unknown): void {
    const msg = message as { event?: string; data?: unknown };
    if (msg.event === 'book') {
      this.emit('orderbook', {
        platform: this.platform,
        data: msg.data,
        timestamp: new Date(),
      });
    } else if (msg.event === 'price_change') {
      this.emit('price', {
        platform: this.platform,
        data: msg.data,
        timestamp: new Date(),
      });
    } else if (msg.event === 'trade') {
      this.emit('trade', {
        platform: this.platform,
        data: msg.data,
        timestamp: new Date(),
      });
    }
  }

  subscribeToMarket(tokenId: string): void {
    this.subscribedMarkets.add(tokenId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'book',
        market: tokenId,
      }));
    }
  }

  unsubscribeFromMarket(tokenId: string): void {
    this.subscribedMarkets.delete(tokenId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'book',
        market: tokenId,
      }));
    }
  }

  private resubscribeAll(): void {
    for (const tokenId of this.subscribedMarkets) {
      this.subscribeToMarket(tokenId);
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
    }
    this.wsReconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, 5000);
  }

  disconnect(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const polymarketClient = new PolymarketClient();
