import type {
  ExecutionPlan,
  ExecutionStep,
  ExecutionSummary,
  PartialFillScenario,
  Platform,
} from '@arbitrage/shared-types';

import { FEES } from './fees.js';
import { estimateSlippage } from './slippage.js';
import type { OrderBookLevel } from '@arbitrage/shared-types';

export interface ExecutionPlanInput {
  opportunityId: string;
  investmentAmount: number;
  buyPlatform: Platform;
  sellPlatform: Platform;
  buyPrice: number;
  sellPrice: number;
  buyOutcome: 'YES' | 'NO';
  sellOutcome: 'YES' | 'NO';
  buyOrderBook: OrderBookLevel[];
  sellOrderBook: OrderBookLevel[];
  buyMarketUrl: string;
  sellMarketUrl: string;
}

export function generateExecutionPlan(input: ExecutionPlanInput): ExecutionPlan {
  const {
    opportunityId,
    investmentAmount,
    buyPlatform,
    sellPlatform,
    buyPrice,
    sellPrice,
    buyOutcome,
    sellOutcome,
    buyOrderBook,
    sellOrderBook,
    buyMarketUrl,
    sellMarketUrl,
  } = input;

  const quantity = Math.floor(investmentAmount / buyPrice);
  if (quantity <= 0) {
    throw new Error('Investment amount too small for minimum trade size');
  }

  const buySlippage = estimateSlippage(buyOrderBook, quantity, 'BUY');
  const sellSlippage = estimateSlippage(sellOrderBook, quantity, 'SELL');

  const buyFee = buyPrice * quantity * FEES[buyPlatform].tradeFee;
  const sellFee = sellPrice * quantity * FEES[sellPlatform].tradeFee;

  const totalBuyCost =
    buySlippage.averageFillPrice * quantity + buyFee;
  const totalSellRevenue =
    sellSlippage.averageFillPrice * quantity - sellFee;

  const steps: ExecutionStep[] = [
    {
      order: 1,
      platform: buyPlatform,
      action: 'BUY',
      outcome: buyOutcome,
      price: buyPrice,
      quantity,
      estimatedCost: buySlippage.averageFillPrice * quantity,
      estimatedFee: buyFee,
      estimatedSlippage: buySlippage.estimatedSlippage,
      url: buyMarketUrl,
      instructions: `Buy ${quantity} ${buyOutcome} shares at ~$${buyPrice.toFixed(2)} on ${buyPlatform}`,
    },
    {
      order: 2,
      platform: sellPlatform,
      action: 'SELL',
      outcome: sellOutcome,
      price: sellPrice,
      quantity,
      estimatedCost: sellSlippage.averageFillPrice * quantity,
      estimatedFee: sellFee,
      estimatedSlippage: sellSlippage.estimatedSlippage,
      url: sellMarketUrl,
      instructions: `Sell ${quantity} ${sellOutcome} shares at ~$${sellPrice.toFixed(2)} on ${sellPlatform}`,
    },
  ];

  const netProfit = totalSellRevenue - totalBuyCost;
  const roi = (netProfit / totalBuyCost) * 100;
  const breakEvenPrice = buyPrice + (buyFee + sellFee) / quantity;

  const summary: ExecutionSummary = {
    totalCost: totalBuyCost,
    expectedProfit: totalSellRevenue - totalBuyCost,
    netProfitAfterFees: netProfit,
    roi,
    breakEvenPrice,
  };

  const partialFillScenarios = generatePartialFillScenarios(
    quantity,
    buySlippage.averageFillPrice,
    sellSlippage.averageFillPrice,
    FEES[buyPlatform].tradeFee,
    FEES[sellPlatform].tradeFee
  );

  const risks = generateRiskWarnings(
    buySlippage,
    sellSlippage,
    buyPlatform,
    sellPlatform
  );

  return {
    opportunityId,
    investmentAmount,
    steps,
    summary,
    risks,
    partialFillScenarios,
  };
}

function generatePartialFillScenarios(
  quantity: number,
  buyPrice: number,
  sellPrice: number,
  buyFeeRate: number,
  sellFeeRate: number
): PartialFillScenario[] {
  const scenarios: PartialFillScenario[] = [];
  const percentages = [25, 50, 75, 100];

  for (const pct of percentages) {
    const filledQty = Math.floor(quantity * (pct / 100));
    if (filledQty <= 0) continue;

    const buyCost = buyPrice * filledQty * (1 + buyFeeRate);
    const sellRevenue = sellPrice * filledQty * (1 - sellFeeRate);
    const profit = sellRevenue - buyCost;
    const roi = (profit / buyCost) * 100;

    let recommendation = 'Proceed with caution';
    if (pct === 100) recommendation = 'Full execution recommended';
    else if (profit > 0) recommendation = 'Still profitable at this fill level';
    else recommendation = 'Consider canceling unfilled portion';

    scenarios.push({
      fillPercentage: pct,
      adjustedProfit: profit,
      adjustedRoi: roi,
      recommendation,
    });
  }

  return scenarios;
}

function generateRiskWarnings(
  buySlippage: ReturnType<typeof estimateSlippage>,
  sellSlippage: ReturnType<typeof estimateSlippage>,
  buyPlatform: Platform,
  sellPlatform: Platform
): string[] {
  const warnings: string[] = [];

  if (buySlippage.partialFill || sellSlippage.partialFill) {
    warnings.push(
      'Insufficient liquidity for full order size - partial fills likely'
    );
  }

  if (buySlippage.estimatedSlippage > 0.02) {
    warnings.push(
      `High slippage expected on ${buyPlatform} buy order (${(buySlippage.estimatedSlippage * 100).toFixed(1)}%)`
    );
  }

  if (sellSlippage.estimatedSlippage > 0.02) {
    warnings.push(
      `High slippage expected on ${sellPlatform} sell order (${(sellSlippage.estimatedSlippage * 100).toFixed(1)}%)`
    );
  }

  warnings.push('Prices may move during execution - monitor both platforms');
  warnings.push('Settlement times may differ between platforms');

  return warnings;
}
