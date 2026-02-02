import type { MarketStatus, Platform } from './platform.js';

export interface Market {
  id: string;
  platform: Platform;
  externalId: string;
  slug?: string;
  question: string;
  description?: string;
  category?: string;

  // Outcomes
  outcomes: string[];

  // Pricing
  yesPrice: number;
  noPrice: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  midpoint?: number;
  spread?: number;

  // Liquidity
  liquidity?: number;
  volume24h?: number;
  volumeTotal?: number;

  // Fees
  feeRate: number;

  // Order book
  orderBookDepth?: OrderBookDepth;

  // Timing
  startDate?: string;
  endDate?: string;
  resolutionDate?: string;

  // Resolution
  resolutionSource?: string;
  resolutionRules?: string;
  resolvedOutcome?: string;

  // Status
  status: MarketStatus;

  // Metadata
  sourceUrl?: string;
  imageUrl?: string;
  tags: string[];

  // Data quality
  lastFetchedAt: string;
  fetchLatencyMs?: number;
  dataVersion: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookDepth {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: string;
}

export interface OrderBook {
  marketId: string;
  platform: Platform;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midpoint: number;
  timestamp: string;
}

export interface PriceSnapshot {
  id: string;
  marketId: string;
  yesPrice: number;
  noPrice: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  spread?: number;
  liquidity?: number;
  volume?: number;
  fetchLatencyMs?: number;
  timestamp: string;
}

export interface MarketSummary {
  id: string;
  platform: Platform;
  question: string;
  yesPrice: number;
  noPrice: number;
  spread?: number;
  liquidity?: number;
  status: MarketStatus;
  lastFetchedAt: string;
}
