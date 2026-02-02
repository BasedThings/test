import { useNavigate } from 'react-router-dom';
import { ExternalLink, Clock, Filter } from 'lucide-react';

import { useArbitrageOpportunities } from '../hooks/useArbitrage';
import { useUIStore } from '../store';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfidenceBadge from '../components/common/ConfidenceBadge';
import PlatformBadge from '../components/common/PlatformBadge';
import { formatRelativeTime, formatCurrency } from '../utils/formatters';

export default function ArbitrageList() {
  const navigate = useNavigate();
  const filters = useUIStore((state) => state.filters);
  const setFilters = useUIStore((state) => state.setFilters);

  const { data, isLoading, error } = useArbitrageOpportunities({
    status: filters.status,
    minSpread: filters.minSpread?.toString(),
    minConfidence: filters.minConfidence?.toString(),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: '50',
  });

  if (error) {
    return (
      <div className="pt-16">
        <div className="card p-8 text-center">
          <p className="text-red-600">Error loading opportunities: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Arbitrage Opportunities</h1>
          <p className="text-gray-500">
            {data?.pagination.total ?? 0} active opportunities
          </p>
        </div>

        {/* Quick Filters */}
        <div className="flex items-center gap-2">
          <button className="btn-secondary gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ sortBy: e.target.value as typeof filters.sortBy })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="netSpread">Sort by Spread</option>
            <option value="confidence">Sort by Confidence</option>
            <option value="detectedAt">Sort by Time</option>
          </select>
        </div>
      </div>

      {/* Opportunities Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8">
            <LoadingSpinner size="lg" className="mx-auto" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No arbitrage opportunities found
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Platforms</th>
                <th>Net Spread</th>
                <th>Max Size</th>
                <th>Confidence</th>
                <th>Detected</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((opp) => (
                <tr
                  key={opp.id}
                  onClick={() => navigate(`/arbitrage/${opp.id}`)}
                  className="cursor-pointer"
                >
                  <td className="max-w-xs">
                    <p className="font-medium text-gray-900 truncate">
                      {opp.match.sourceMarket.question}
                    </p>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <PlatformBadge platform={opp.match.sourceMarket.platform} />
                      <span className="text-gray-400">↔</span>
                      <PlatformBadge platform={opp.match.targetMarket.platform} />
                    </div>
                  </td>
                  <td>
                    <span className="text-lg font-semibold text-profit-600 font-mono-nums">
                      {(opp.spreadPercentage * 100).toFixed(2)}%
                    </span>
                  </td>
                  <td>
                    <span className="font-mono-nums">
                      {formatCurrency(opp.maxProfitableSize)}
                    </span>
                  </td>
                  <td>
                    <ConfidenceBadge score={opp.confidenceScore} />
                  </td>
                  <td>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      {formatRelativeTime(opp.detectedAt)}
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/arbitrage/${opp.id}`);
                      }}
                      className="p-2 text-gray-400 hover:text-indigo-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
