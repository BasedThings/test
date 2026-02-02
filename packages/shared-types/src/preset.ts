import type { ArbitrageFilters } from './arbitrage.js';

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: ArbitrageFilters;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  columns: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Watchlist {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  watchlistId: string;
  marketId?: string;
  matchId?: string;
  alertThreshold?: number;
  alertEnabled: boolean;
  notes?: string;
  createdAt: string;
}

export interface WatchlistWithItems extends Watchlist {
  items: WatchlistItem[];
}
