import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FilterState {
  minSpread: number | undefined;
  minConfidence: number | undefined;
  platforms: string[];
  status: 'ACTIVE' | 'EXPIRED' | 'all';
  sortBy: 'netSpread' | 'confidence' | 'liquidity' | 'detectedAt';
  sortOrder: 'asc' | 'desc';
}

interface UIState {
  sidebarOpen: boolean;
  filters: FilterState;
  pollingEnabled: boolean;
  pollingInterval: number;
}

interface UIActions {
  setSidebarOpen: (open: boolean) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  setPollingEnabled: (enabled: boolean) => void;
  setPollingInterval: (interval: number) => void;
}

const defaultFilters: FilterState = {
  minSpread: undefined,
  minConfidence: undefined,
  platforms: [],
  status: 'ACTIVE',
  sortBy: 'netSpread',
  sortOrder: 'desc',
};

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      filters: defaultFilters,
      pollingEnabled: true,
      pollingInterval: 3000,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),

      resetFilters: () => set({ filters: defaultFilters }),

      setPollingEnabled: (enabled) => set({ pollingEnabled: enabled }),

      setPollingInterval: (interval) => set({ pollingInterval: interval }),
    }),
    {
      name: 'arbitrage-ui-store',
      partialize: (state) => ({
        filters: state.filters,
        pollingInterval: state.pollingInterval,
      }),
    }
  )
);
