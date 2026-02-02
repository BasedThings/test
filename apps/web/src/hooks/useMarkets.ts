import { useQuery } from '@tanstack/react-query';

import { api } from '../services/api';

export function useMarkets(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['markets', params],
    queryFn: () => api.getMarkets(params),
    staleTime: 10000,
  });
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['market', id],
    queryFn: () => api.getMarket(id),
    enabled: !!id,
  });
}
