export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiMeta {
  fetchedAt: string;
  cacheHit?: boolean;
  dataAge?: number;
  refreshRecommendedIn?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
  meta?: ApiMeta;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'offline';
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    polymarket: ServiceStatus;
    kalshi: ServiceStatus;
  };
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'offline';
  lastSuccessAt?: string;
  errorCount?: number;
  latencyMs?: number;
}

export interface SystemStatus {
  lastFetch: {
    polymarket: string;
    kalshi: string;
  };
  marketCounts: {
    polymarket: number;
    kalshi: number;
  };
  activeArbitrageCount: number;
  matchCount: number;
  systemMetrics: {
    uptime: number;
    avgLatencyMs: number;
    errorRate: number;
  };
}
