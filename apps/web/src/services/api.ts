const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API Error: ${response.status}`);
  }

  return response.json();
}

// Types
export interface Platform {
  status: string;
  marketCount: number;
  lastFetch: string;
  avgLatencyMs: number;
}

export interface SystemStatus {
  platforms: {
    polymarket: Platform;
    kalshi: Platform;
    predictit: Platform;
  };
  matching: {
    confirmedMatches: number;
    pendingReview: number;
  };
  arbitrage: {
    activeCount: number;
    topOpportunities: Array<{
      id: string;
      spread: number;
      confidence: number;
      maxSize: number;
      ageSeconds: number;
    }>;
  };
  ingestion: {
    marketsIngested: number;
    orderbooksUpdated: number;
    quotesUpdated: number;
    errorCount: number;
    lastFullSync: string;
  };
  system: {
    uptime: number;
    memoryMB: number;
    timestamp: string;
  };
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: Record<string, {
    status: string;
    lastSuccessAt?: string;
    latencyMs?: number;
    errorCount?: number;
  }>;
}

export interface Market {
  id: string;
  platform: string;
  externalId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  spread?: number;
  liquidity?: number;
  volume24h?: number;
  status: string;
  category?: string;
  lastFetchedAt: string;
  sourceUrl?: string;
}

export interface MarketMatch {
  id: string;
  sourceMarket: Market;
  targetMarket: Market;
  semanticScore: number;
  resolutionScore: number;
  dateScore: number;
  overallScore: number;
  matchReason: string;
  matchedTerms: string[];
  resolutionDiff?: string;
  status: string;
}

export interface ArbitrageOpportunity {
  id: string;
  matchId: string;
  strategy: {
    action: string;
    buyPlatform: string;
    buyPrice: number;
    sellPlatform: string;
    sellPrice: number;
  };
  profitAnalysis: {
    grossSpread: number;
    netSpread: number;
    spreadPercentage: number;
    totalFees: number;
    roi: number;
    annualizedRoi: number;
    maxExecutableSize: number;
  };
  confidence: {
    overall: number;
    freshness: number;
    liquidity: number;
    consistency: number;
    dataAgeMs: number;
  };
  status: string;
  detectedAt: string;
  match: {
    id: string;
    overallScore: number;
    sourceMarket: Market;
    targetMarket: Market;
  };
}

export interface ExecutionPlan {
  opportunityId: string;
  investmentAmount: number;
  steps: Array<{
    order: number;
    platform: string;
    action: string;
    outcome: string;
    quantity: number;
    limitPrice: number;
    expectedCost?: number;
    expectedRevenue?: number;
    fee: number;
    url?: string;
    instructions: string;
  }>;
  summary: {
    totalCost: number;
    totalRevenue: number;
    expectedProfit: number;
    roi: number;
    breakEvenPrice: number;
  };
  risks: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  meta?: {
    fetchedAt: string;
    cacheHit?: boolean;
  };
}

// API client
export const api = {
  // Health
  getHealth: () => fetchApi<HealthStatus>('/health'),
  getStatus: () => fetchApi<SystemStatus>('/status'),
  getPlatformHealth: () => fetchApi<{ platforms: Array<{
    platform: string;
    status: string;
    lastSuccessAt?: string;
    avgLatencyMs: number;
    consecutiveErrors: number;
  }> }>('/platforms'),

  // Markets
  getMarkets: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return fetchApi<PaginatedResponse<Market>>(`/markets${query}`);
  },
  getMarket: (id: string) => fetchApi<{ data: Market }>(`/markets/${id}`),
  getMarketOrderbook: (id: string) => fetchApi<{ data: {
    marketId: string;
    platform: string;
    bestBid: number;
    bestAsk: number;
    spread: number;
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
    timestamp: string;
  }; meta: { dataAge: number } }>(`/markets/${id}/orderbook`),

  // Matches
  getMatches: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return fetchApi<PaginatedResponse<MarketMatch>>(`/matches${query}`);
  },
  getMatch: (id: string) => fetchApi<{ data: MarketMatch; explanation: {
    semanticAnalysis: string;
    resolutionComparison: string;
    matchedTerms: string[];
    recommendation: string;
  } }>(`/matches/${id}`),
  reviewMatch: (id: string, status: 'CONFIRMED' | 'REJECTED', notes?: string) =>
    fetchApi<{ success: boolean }>(`/matches/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, notes }),
    }),

  // Arbitrage
  getArbitrageOpportunities: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return fetchApi<PaginatedResponse<ArbitrageOpportunity>>(`/arbitrage${query}`);
  },
  getArbitrageOpportunity: (id: string) =>
    fetchApi<{ data: ArbitrageOpportunity & {
      prices: { source: { yesPrice: number; noPrice: number }; target: { yesPrice: number; noPrice: number } };
      orderbooks: { source: unknown; target: unknown };
    }; auditTrail: unknown }>(`/arbitrage/${id}`),
  getExecutionPlan: (id: string, investmentAmount?: number) => {
    const query = investmentAmount ? `?investmentAmount=${investmentAmount}` : '';
    return fetchApi<ExecutionPlan>(`/arbitrage/${id}/execution-plan${query}`);
  },
  getPartialFillScenarios: (id: string) =>
    fetchApi<{ opportunityId: string; scenarios: Array<{
      fillPercentage: number;
      filledQuantity: number;
      adjustedProfit: number;
      risk: string;
      recommendation: string;
    }> }>(`/arbitrage/${id}/partial-fills`),

  // Calculators
  calculateFees: (platform: string, amount: number, action: 'BUY' | 'SELL') =>
    fetchApi<{ fee: number; netAmount: number; feeRate: number }>('/calculator/fees', {
      method: 'POST',
      body: JSON.stringify({ platform, amount, action }),
    }),
  calculateEV: (probability: number, odds: number, stake: number) =>
    fetchApi<{ ev: number; recommendation: string }>('/calculator/ev', {
      method: 'POST',
      body: JSON.stringify({ probability, odds, stake }),
    }),
  convertOdds: (value: number, from: string, to: string) =>
    fetchApi<{ converted: number }>('/calculator/odds', {
      method: 'POST',
      body: JSON.stringify({ value, from, to }),
    }),
  calculateVig: (yesPrice: number, noPrice: number) =>
    fetchApi<{ vig: number; overround: number; fairYes: number; fairNo: number }>('/calculator/vig', {
      method: 'POST',
      body: JSON.stringify({ yesPrice, noPrice }),
    }),
};
