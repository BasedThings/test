// Platform & enums
export type {
  Platform,
  MarketStatus,
  MatchStatus,
  ArbitrageStatus,
  PlatformConfig,
} from './platform.js';

export { PLATFORM_CONFIGS } from './platform.js';

// Market types
export type {
  Market,
  OrderBookLevel,
  OrderBookDepth,
  OrderBook,
  PriceSnapshot,
  MarketSummary,
} from './market.js';

// Match types
export type {
  MarketMatch,
  MarketMatchWithMarkets,
  MatchExplanation,
  MatchReviewRequest,
} from './match.js';

// Arbitrage types
export type {
  ArbitrageStrategy,
  ArbitrageOpportunity,
  ArbitrageOpportunityWithMatch,
  ConfidenceFactors,
  ExecutionStep,
  ExecutionPlan,
  ExecutionSummary,
  PartialFillScenario,
  ArbitrageFilters,
} from './arbitrage.js';

// API types
export type {
  ApiResponse,
  ApiMeta,
  PaginatedResponse,
  Pagination,
  ApiError,
  HealthStatus,
  ServiceStatus,
  SystemStatus,
} from './api.js';

// Preset & watchlist types
export type {
  FilterPreset,
  Watchlist,
  WatchlistItem,
  WatchlistWithItems,
} from './preset.js';
