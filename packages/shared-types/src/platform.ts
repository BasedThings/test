export type Platform = 'POLYMARKET' | 'KALSHI';

export type MarketStatus = 'ACTIVE' | 'CLOSED' | 'RESOLVED' | 'CANCELLED';

export type MatchStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED' | 'STALE';

export type ArbitrageStatus = 'ACTIVE' | 'EXPIRED' | 'EXECUTED' | 'MISSED';

export interface PlatformConfig {
  platform: Platform;
  name: string;
  baseUrl: string;
  apiBaseUrl: string;
  feeRate: number;
  minOrderSize: number;
  tickSize: number;
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  POLYMARKET: {
    platform: 'POLYMARKET',
    name: 'Polymarket',
    baseUrl: 'https://polymarket.com',
    apiBaseUrl: 'https://clob.polymarket.com',
    feeRate: 0.02,
    minOrderSize: 1,
    tickSize: 0.01,
  },
  KALSHI: {
    platform: 'KALSHI',
    name: 'Kalshi',
    baseUrl: 'https://kalshi.com',
    apiBaseUrl: 'https://api.elections.kalshi.com/trade-api/v2',
    feeRate: 0.01,
    minOrderSize: 1,
    tickSize: 0.01,
  },
};
