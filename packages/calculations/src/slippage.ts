import type { OrderBookLevel } from '@arbitrage/shared-types';

export interface SlippageEstimate {
  estimatedSlippage: number;
  averageFillPrice: number;
  worstFillPrice: number;
  levelsUsed: number;
  partialFill: boolean;
  fillableQuantity: number;
}

export function estimateSlippage(
  orderBook: OrderBookLevel[],
  quantity: number,
  side: 'BUY' | 'SELL'
): SlippageEstimate {
  if (orderBook.length === 0 || quantity <= 0) {
    return {
      estimatedSlippage: 0,
      averageFillPrice: 0,
      worstFillPrice: 0,
      levelsUsed: 0,
      partialFill: true,
      fillableQuantity: 0,
    };
  }

  const levels =
    side === 'BUY'
      ? [...orderBook].sort((a, b) => a.price - b.price)
      : [...orderBook].sort((a, b) => b.price - a.price);

  const bestPrice = levels[0]?.price ?? 0;
  let remainingQuantity = quantity;
  let totalCost = 0;
  let levelsUsed = 0;
  let worstPrice = bestPrice;

  for (const level of levels) {
    if (remainingQuantity <= 0) break;

    const fillSize = Math.min(remainingQuantity, level.size);
    totalCost += fillSize * level.price;
    remainingQuantity -= fillSize;
    worstPrice = level.price;
    levelsUsed++;
  }

  const filledQuantity = quantity - remainingQuantity;
  const averageFillPrice = filledQuantity > 0 ? totalCost / filledQuantity : 0;

  const slippage =
    bestPrice > 0 ? Math.abs(averageFillPrice - bestPrice) / bestPrice : 0;

  return {
    estimatedSlippage: slippage,
    averageFillPrice,
    worstFillPrice: worstPrice,
    levelsUsed,
    partialFill: remainingQuantity > 0,
    fillableQuantity: filledQuantity,
  };
}

export function estimateCombinedSlippage(
  buyOrderBook: OrderBookLevel[],
  sellOrderBook: OrderBookLevel[],
  quantity: number
): number {
  const buySlippage = estimateSlippage(buyOrderBook, quantity, 'BUY');
  const sellSlippage = estimateSlippage(sellOrderBook, quantity, 'SELL');

  return buySlippage.estimatedSlippage + sellSlippage.estimatedSlippage;
}

export function calculateSlippageImpact(
  slippage: number,
  tradeAmount: number
): number {
  return slippage * tradeAmount;
}
