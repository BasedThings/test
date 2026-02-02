import { ExternalLink } from 'lucide-react';

import { useMarkets } from '../hooks/useMarkets';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PlatformBadge from '../components/common/PlatformBadge';
import { formatCurrency, formatPrice } from '../utils/formatters';

export default function MarketsList() {
  const { data, isLoading, error } = useMarkets({ limit: '100' });

  if (error) {
    return (
      <div className="pt-16">
        <div className="card p-8 text-center">
          <p className="text-red-600">Error loading markets: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-16">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Markets</h1>
        <p className="text-gray-500">
          {data?.pagination.total ?? 0} active markets across all platforms
        </p>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8">
            <LoadingSpinner size="lg" className="mx-auto" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No markets found</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Question</th>
                <th>YES</th>
                <th>NO</th>
                <th>Spread</th>
                <th>Liquidity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((market) => (
                <tr key={market.id}>
                  <td>
                    <PlatformBadge platform={market.platform} />
                  </td>
                  <td className="max-w-md">
                    <p className="font-medium text-gray-900 truncate">
                      {market.question}
                    </p>
                  </td>
                  <td>
                    <span className="font-mono-nums text-profit-600">
                      {formatPrice(market.yesPrice)}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono-nums text-loss-600">
                      {formatPrice(market.noPrice)}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono-nums">
                      {market.spread
                        ? `${(market.spread * 100).toFixed(1)}%`
                        : '-'}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono-nums">
                      {market.liquidity
                        ? formatCurrency(market.liquidity)
                        : '-'}
                    </span>
                  </td>
                  <td>
                    {market.sourceUrl && (
                      <a
                        href={market.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-indigo-600"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
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
