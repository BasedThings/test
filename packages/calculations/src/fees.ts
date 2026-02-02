import type { Platform } from '@arbitrage/shared-types';

export interface PlatformFees {
  tradeFee: number;
  withdrawalFee: number;
  winFee: number;
  minTradeSize: number;
}

export const FEES: Record<Platform, PlatformFees> = {
  POLYMARKET: {
    tradeFee: 0.02,
    withdrawalFee: 0,
    winFee: 0,
    minTradeSize: 1,
  },
  KALSHI: {
    tradeFee: 0.01,
    withdrawalFee: 0,
    winFee: 0,
    minTradeSize: 1,
  },
};

export function calculateTradeFee(
  platform: Platform,
  price: number,
  quantity: number
): number {
  const feeRate = FEES[platform].tradeFee;
  return price * quantity * feeRate;
}

export function calculateTotalFees(
  buyPlatform: Platform,
  sellPlatform: Platform,
  buyPrice: number,
  sellPrice: number,
  quantity: number
): number {
  const buyFee = calculateTradeFee(buyPlatform, buyPrice, quantity);
  const sellFee = calculateTradeFee(sellPlatform, sellPrice, quantity);
  return buyFee + sellFee;
}

export function getBreakEvenSpread(
  buyPlatform: Platform,
  sellPlatform: Platform,
  buyPrice: number
): number {
  const buyFeeRate = FEES[buyPlatform].tradeFee;
  const sellFeeRate = FEES[sellPlatform].tradeFee;

  return buyPrice * (buyFeeRate + sellFeeRate);
}
