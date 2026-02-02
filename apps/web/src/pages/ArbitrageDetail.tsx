import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, AlertTriangle, DollarSign, TrendingUp, Clock, Shield } from 'lucide-react';
import clsx from 'clsx';

import { useArbitrageOpportunity, useExecutionPlan, usePartialFillScenarios } from '../hooks/useArbitrage';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfidenceBadge from '../components/common/ConfidenceBadge';
import PlatformBadge from '../components/common/PlatformBadge';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDataAge(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function ArbitrageDetail() {
  const { id } = useParams<{ id: string }>();
  const [investmentAmount, setInvestmentAmount] = useState(100);

  const { data, isLoading, error } = useArbitrageOpportunity(id!);
  const { data: executionPlan, isLoading: planLoading } = useExecutionPlan(id!, investmentAmount);
  const { data: scenarios } = usePartialFillScenarios(id!);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 pt-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="pt-16">
        <div className="card p-8 text-center">
          <p className="text-red-600">
            {error?.message || 'Opportunity not found'}
          </p>
          <Link to="/arbitrage" className="btn-primary mt-4">
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  const opp = data.data;

  return (
    <div className="space-y-6 pt-16">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/arbitrage"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Arbitrage Opportunity
          </h1>
          <p className="text-gray-500 text-sm">
            {opp.match?.sourceMarket?.question || 'Loading...'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-green-600">
            {(opp.profitAnalysis.roi * 100).toFixed(2)}%
          </div>
          <div className="text-sm text-gray-500">Expected ROI</div>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            Net Spread
          </div>
          <p className="text-2xl font-bold text-green-600 font-mono">
            {(opp.profitAnalysis.spreadPercentage * 100).toFixed(2)}%
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Max Size
          </div>
          <p className="text-2xl font-bold text-gray-900 font-mono">
            {formatCurrency(opp.profitAnalysis.maxExecutableSize)}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Shield className="w-4 h-4" />
            Confidence
          </div>
          <div className="mt-1">
            <ConfidenceBadge score={opp.confidence.overall} />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Clock className="w-4 h-4" />
            Data Age
          </div>
          <p className="text-xl font-bold text-gray-900">
            {formatDataAge(opp.confidence.dataAgeMs)}
          </p>
        </div>
      </div>

      {/* Market Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Market (Buy) */}
        <div className="card p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">BUY</span>
              <PlatformBadge platform={opp.match?.sourceMarket?.platform || opp.strategy.buyPlatform} />
            </div>
            {opp.match?.sourceMarket?.sourceUrl && (
              <a
                href={opp.match.sourceMarket.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="font-medium text-gray-900 text-sm mb-3 line-clamp-2">
            {opp.match?.sourceMarket?.question || 'Market question'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">YES Price</p>
              <p className="text-xl font-bold font-mono text-blue-600">
                ${opp.strategy.buyPrice.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data Freshness</p>
              <p className="text-sm font-medium text-gray-600">
                {formatDataAge(opp.confidence.dataAgeMs)}
              </p>
            </div>
          </div>
        </div>

        {/* Target Market (Sell) */}
        <div className="card p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded">SELL</span>
              <PlatformBadge platform={opp.match?.targetMarket?.platform || opp.strategy.sellPlatform} />
            </div>
            {opp.match?.targetMarket?.sourceUrl && (
              <a
                href={opp.match.targetMarket.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="font-medium text-gray-900 text-sm mb-3 line-clamp-2">
            {opp.match?.targetMarket?.question || 'Market question'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">YES Price</p>
              <p className="text-xl font-bold font-mono text-green-600">
                ${opp.strategy.sellPrice.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data Freshness</p>
              <p className="text-sm font-medium text-gray-600">
                {formatDataAge(opp.confidence.dataAgeMs)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Execution Plan Calculator */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Execution Planner</h2>
          <p className="text-sm text-gray-500">Calculate profit for your investment size</p>
        </div>
        <div className="p-4">
          {/* Investment input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Investment Amount
            </label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                  min={1}
                  max={opp.profitAnalysis.maxExecutableSize}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                {[50, 100, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setInvestmentAmount(amt)}
                    className={clsx(
                      'px-3 py-1 text-sm rounded-lg transition-colors',
                      investmentAmount === amt
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Execution steps */}
          {planLoading ? (
            <LoadingSpinner />
          ) : executionPlan ? (
            <div className="space-y-4">
              {executionPlan.steps.map((step) => (
                <div
                  key={step.order}
                  className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                >
                  <div className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-full font-bold text-white',
                    step.action === 'BUY' ? 'bg-blue-600' : 'bg-green-600'
                  )}>
                    {step.order}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {step.action} {step.quantity.toFixed(2)} {step.outcome} on {step.platform}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {step.instructions}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>Price: <span className="font-mono">${step.limitPrice.toFixed(3)}</span></span>
                      <span>Fee: <span className="font-mono">${step.fee.toFixed(2)}</span></span>
                      {step.expectedCost && (
                        <span>Cost: <span className="font-mono">${step.expectedCost.toFixed(2)}</span></span>
                      )}
                      {step.expectedRevenue && (
                        <span>Revenue: <span className="font-mono">${step.expectedRevenue.toFixed(2)}</span></span>
                      )}
                    </div>
                  </div>
                  {step.url && (
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-sm"
                    >
                      Open <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}
                </div>
              ))}

              {/* Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <h3 className="font-semibold text-green-800 mb-2">Expected Outcome</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-green-600">Total Cost</p>
                    <p className="font-mono font-bold text-green-800">{formatCurrency(executionPlan.summary.totalCost)}</p>
                  </div>
                  <div>
                    <p className="text-green-600">Total Revenue</p>
                    <p className="font-mono font-bold text-green-800">{formatCurrency(executionPlan.summary.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-green-600">Expected Profit</p>
                    <p className="font-mono font-bold text-green-800">{formatCurrency(executionPlan.summary.expectedProfit)}</p>
                  </div>
                  <div>
                    <p className="text-green-600">ROI</p>
                    <p className="font-mono font-bold text-green-800">{executionPlan.summary.roi.toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Partial Fill Scenarios */}
      {scenarios && (
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Partial Fill Scenarios</h2>
            <p className="text-sm text-gray-500">What happens if only part of your order fills</p>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Fill %</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Quantity</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Profit</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Risk</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.scenarios.map((scenario) => (
                    <tr key={scenario.fillPercentage} className="border-b border-gray-100">
                      <td className="py-2 px-3 font-mono">{scenario.fillPercentage}%</td>
                      <td className="py-2 px-3 font-mono">{scenario.filledQuantity.toFixed(2)}</td>
                      <td className="py-2 px-3 font-mono text-green-600">{formatCurrency(scenario.adjustedProfit)}</td>
                      <td className="py-2 px-3">
                        <span className={clsx(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          scenario.risk === 'LOW' && 'bg-green-100 text-green-700',
                          scenario.risk === 'MEDIUM' && 'bg-yellow-100 text-yellow-700',
                          scenario.risk === 'HIGH' && 'bg-red-100 text-red-700'
                        )}>
                          {scenario.risk}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-600">{scenario.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      <div className="card bg-yellow-50 border-yellow-200">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Risk Warnings</p>
              <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                <li>• Prices may move during execution - act quickly</li>
                <li>• Partial fills may occur on either platform</li>
                <li>• Settlement times differ between platforms</li>
                <li>• Data is {formatDataAge(opp.confidence.dataAgeMs)} old - refresh before trading</li>
                <li>• Platform fees are estimates - verify before execution</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Confidence breakdown */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Confidence Analysis</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Overall</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 rounded-full h-2"
                    style={{ width: `${opp.confidence.overall * 100}%` }}
                  />
                </div>
                <span className="text-sm font-mono">{(opp.confidence.overall * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Freshness</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 rounded-full h-2"
                    style={{ width: `${opp.confidence.freshness * 100}%` }}
                  />
                </div>
                <span className="text-sm font-mono">{(opp.confidence.freshness * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Liquidity</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 rounded-full h-2"
                    style={{ width: `${opp.confidence.liquidity * 100}%` }}
                  />
                </div>
                <span className="text-sm font-mono">{(opp.confidence.liquidity * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Consistency</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 rounded-full h-2"
                    style={{ width: `${opp.confidence.consistency * 100}%` }}
                  />
                </div>
                <span className="text-sm font-mono">{(opp.confidence.consistency * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
