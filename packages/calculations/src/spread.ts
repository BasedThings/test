import type { OrderBookLevel, Platform } from '@arbitrage/shared-types';

import { FEES } from './fees.js';

export interface SpreadCalculationInput {
  buyPrice: number;
  sellPrice: number;
  buyPlatform: Platform;
  sellPlatform: Platform;
  tradeAmount?: number;
}

export interface SpreadResult {
  grossSpread: number;
  netSpread: number;
  spreadPercentage: number;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  isProfitable: boolean;
}

export function calculateGrossSpread(buyPrice: number, sellPrice: number): number {
  return sellPrice - buyPrice;
}

export function calculateSpread(input: SpreadCalculationInput): SpreadResult {
  const { buyPrice, sellPrice, buyPlatform, sellPlatform, tradeAmount = 100 } = input;

  const grossSpread = calculateGrossSpread(buyPrice, sellPrice);

  const buyFeeRate = FEES[buyPlatform].tradeFee;
  const sellFeeRate = FEES[sellPlatform].tradeFee;

  const buyFee = buyPrice * buyFeeRate * tradeAmount;
  const sellFee = sellPrice * sellFeeRate * tradeAmount;
  const totalFees = buyFee + sellFee;

  const grossProfitPerShare = grossSpread;
  const feePerShare = (buyFee + sellFee) / tradeAmount;
  const netSpread = grossProfitPerShare - feePerShare;

  const spreadPercentage = buyPrice > 0 ? (netSpread / buyPrice) * 100 : 0;

  return {
    grossSpread,
    netSpread,
    spreadPercentage,
    buyFee,
    sellFee,
    totalFees,
    isProfitable: netSpread > 0,
  };
}

export function calculateMaxProfitableSize(
  orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[] },
  buyPlatform: Platform,
  sellPlatform: Platform,
  minProfitPerShare: number = 0.01
): number {
  const buyFeeRate = FEES[buyPlatform].tradeFee;
  const sellFeeRate = FEES[sellPlatform].tradeFee;

  let cumulativeSize = 0;
  let bidIdx = 0;
  let askIdx = 0;

  const sortedBids = [...orderBook.bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...orderBook.asks].sort((a, b) => a.price - b.price);

  while (bidIdx < sortedBids.length && askIdx < sortedAsks.length) {
    const bid = sortedBids[bidIdx];
    const ask = sortedAsks[askIdx];

    if (!bid || !ask) break;

    const grossSpread = bid.price - ask.price;
    const netSpread = grossSpread - ask.price * buyFeeRate - bid.price * sellFeeRate;

    if (netSpread < minProfitPerShare) break;

    const availableSize = Math.min(bid.size, ask.size);
    cumulativeSize += availableSize;

    if (bid.size <= ask.size) {
      bidIdx++;
      if (askIdx < sortedAsks.length) {
        sortedAsks[askIdx] = { ...ask, size: ask.size - bid.size };
      }
    } else {
      askIdx++;
      if (bidIdx < sortedBids.length) {
        sortedBids[bidIdx] = { ...bid, size: bid.size - ask.size };
      }
    }
  }

  return cumulativeSize;
}

export function calculateROI(netProfit: number, investment: number): number {
  if (investment <= 0) return 0;
  return (netProfit / investment) * 100;
}

export function calculateAnnualizedROI(
  roi: number,
  holdingPeriodDays: number
): number {
  if (holdingPeriodDays <= 0) return 0;
  return roi * (365 / holdingPeriodDays);
}
