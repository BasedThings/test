import { useNavigate } from 'react-router-dom';
import { TrendingUp, BarChart3, Activity, Clock, RefreshCw, AlertTriangle, Zap } from 'lucide-react';
import clsx from 'clsx';

import { useStatus } from '../hooks/useHealth';
import { useArbitrageOpportunities } from '../hooks/useArbitrage';
import { useSocket } from '../hooks/useSocket';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PlatformBadge from '../components/common/PlatformBadge';
import ConfidenceBadge from '../components/common/ConfidenceBadge';

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isConnected } = useSocket();
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useStatus();
  const { data: arbitrage, isLoading: arbLoading, refetch: refetchArbitrage } = useArbitrageOpportunities({
    limit: '10',
    status: 'ACTIVE',
    sortBy: 'netSpread',
    sortOrder: 'desc',
  });

  const handleRefresh = () => {
    refetchStatus();
    refetchArbitrage();
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const marketCounts = {
    polymarket: status?.platforms?.polymarket?.marketCount ?? 0,
    kalshi: status?.platforms?.kalshi?.marketCount ?? 0,
    predictit: status?.platforms?.predictit?.marketCount ?? 0,
  };

  const stats = [
    {
      label: 'Active Opportunities',
      value: status?.arbitrage?.activeCount ?? 0,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'Real arbitrage available',
    },
    {
      label: 'Confirmed Matches',
      value: status?.matching?.confirmedMatches ?? 0,
      icon: Activity,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      description: 'Cross-platform pairs',
    },
    {
      label: 'Polymarket',
      value: marketCounts.polymarket,
      icon: BarChart3,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: status?.platforms?.polymarket?.status || 'Unknown',
    },
    {
      label: 'Kalshi',
      value: marketCounts.kalshi,
      icon: BarChart3,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      description: status?.platforms?.kalshi?.status || 'Unknown',
    },
  ];

  return (
    <div className="space-y-6 pt-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Arbitrage Scanner</h1>
          <p className="text-gray-500">Real-time cross-platform arbitrage opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
            isConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          )}>
            <span className={clsx(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
            )} />
            {isConnected ? 'Live' : 'Connecting...'}
          </div>
          <button
            onClick={handleRefresh}
            className="btn-secondary gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stat.value.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main content: Opportunities */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Active Opportunities</h2>
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
              {arbitrage?.data?.length ?? 0} found
            </span>
          </div>
          <button
            onClick={() => navigate('/arbitrage')}
            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
          >
            View all →
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {arbLoading ? (
            <div className="p-8">
              <LoadingSpinner size="lg" className="mx-auto" />
            </div>
          ) : !arbitrage?.data?.length ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No active opportunities</p>
              <p className="text-gray-400 text-sm mt-1">
                Scanning markets for arbitrage...
              </p>
            </div>
          ) : (
            arbitrage.data.map((opp) => (
              <div
                key={opp.id}
                onClick={() => navigate(`/arbitrage/${opp.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Market info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {opp.match.sourceMarket.question}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <PlatformBadge platform={opp.match.sourceMarket.platform} />
                      <span className="text-gray-400">→</span>
                      <PlatformBadge platform={opp.match.targetMarket.platform} />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>
                        Buy @ <span className="font-mono text-gray-900">${opp.strategy.buyPrice.toFixed(3)}</span>
                      </span>
                      <span>
                        Sell @ <span className="font-mono text-gray-900">${opp.strategy.sellPrice.toFixed(3)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right: Profit metrics */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-green-600">
                      {(opp.profitAnalysis.roi * 100).toFixed(2)}%
                    </div>
                    <div className="text-sm text-gray-500">
                      ROI
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-2">
                      <ConfidenceBadge score={opp.confidence.overall} />
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(opp.detectedAt)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Max: {formatCurrency(opp.profitAnalysis.maxExecutableSize)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* System info */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Data Ingestion</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Markets ingested</span>
                <span className="font-mono">{status.ingestion?.marketsIngested?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Orderbooks updated</span>
                <span className="font-mono">{status.ingestion?.orderbooksUpdated?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last sync</span>
                <span className="font-mono">{status.ingestion?.lastFullSync ? formatTimeAgo(status.ingestion.lastFullSync) : 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Platform Latency</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Polymarket</span>
                <span className="font-mono">{status.platforms?.polymarket?.avgLatencyMs ?? 'N/A'}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Kalshi</span>
                <span className="font-mono">{status.platforms?.kalshi?.avgLatencyMs ?? 'N/A'}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">PredictIt</span>
                <span className="font-mono">{status.platforms?.predictit?.avgLatencyMs ?? 'N/A'}ms</span>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">System</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Uptime</span>
                <span className="font-mono">{Math.floor((status.system?.uptime ?? 0) / 60)}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Memory</span>
                <span className="font-mono">{status.system?.memoryMB ?? 0}MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Errors</span>
                <span className={clsx(
                  'font-mono',
                  (status.ingestion?.errorCount ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                )}>
                  {status.ingestion?.errorCount ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
