import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useArbitrageOpportunities(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['arbitrage', params],
    queryFn: () => api.getArbitrageOpportunities(params),
    refetchInterval: 3000,
    staleTime: 1000,
  });
}

export function useArbitrageOpportunity(id: string) {
  return useQuery({
    queryKey: ['arbitrage', id],
    queryFn: () => api.getArbitrageOpportunity(id),
    enabled: !!id,
    refetchInterval: 2000,
  });
}

export function useExecutionPlan(id: string, investmentAmount?: number) {
  return useQuery({
    queryKey: ['arbitrage', id, 'execution-plan', investmentAmount],
    queryFn: () => api.getExecutionPlan(id, investmentAmount),
    enabled: !!id,
  });
}

export function usePartialFillScenarios(id: string) {
  return useQuery({
    queryKey: ['arbitrage', id, 'partial-fills'],
    queryFn: () => api.getPartialFillScenarios(id),
    enabled: !!id,
  });
}

export function useTopOpportunities(limit = 5) {
  return useArbitrageOpportunities({
    status: 'ACTIVE',
    sortBy: 'netSpread',
    sortOrder: 'desc',
    limit: limit.toString(),
  });
}
