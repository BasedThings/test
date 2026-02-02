import type { ConfidenceFactors } from '@arbitrage/shared-types';

export interface ConfidenceInput {
  sourceDataAgeMs: number;
  targetDataAgeMs: number;
  sourceLiquidity: number;
  targetLiquidity: number;
  priceVolatility: number;
  recentPriceChanges: number;
  semanticScore: number;
  resolutionScore: number;
}

export interface ConfidenceWeights {
  freshness: number;
  liquidity: number;
  consistency: number;
  matchQuality: number;
}

export const DEFAULT_WEIGHTS: ConfidenceWeights = {
  freshness: 0.3,
  liquidity: 0.25,
  consistency: 0.2,
  matchQuality: 0.25,
};

export const DEFAULT_THRESHOLDS = {
  maxAcceptableAgeMs: 5000,
  minRequiredLiquidity: 1000,
  maxVolatility: 0.1,
  maxRecentChanges: 5,
};

export function calculateFreshnessScore(
  sourceAgeMs: number,
  targetAgeMs: number,
  maxAcceptableAgeMs: number = DEFAULT_THRESHOLDS.maxAcceptableAgeMs
): number {
  const maxAge = Math.max(sourceAgeMs, targetAgeMs);

  if (maxAge <= 0) return 1;
  if (maxAge >= maxAcceptableAgeMs) return 0;

  return 1 - maxAge / maxAcceptableAgeMs;
}

export function calculateLiquidityScore(
  sourceLiquidity: number,
  targetLiquidity: number,
  minRequiredLiquidity: number = DEFAULT_THRESHOLDS.minRequiredLiquidity
): number {
  const minLiquidity = Math.min(sourceLiquidity, targetLiquidity);

  if (minLiquidity <= 0) return 0;
  if (minLiquidity >= minRequiredLiquidity * 2) return 1;

  return Math.min(1, minLiquidity / (minRequiredLiquidity * 2));
}

export function calculateConsistencyScore(
  priceVolatility: number,
  recentPriceChanges: number,
  maxVolatility: number = DEFAULT_THRESHOLDS.maxVolatility,
  maxRecentChanges: number = DEFAULT_THRESHOLDS.maxRecentChanges
): number {
  const volatilityScore =
    priceVolatility >= maxVolatility ? 0 : 1 - priceVolatility / maxVolatility;

  const changesScore =
    recentPriceChanges >= maxRecentChanges
      ? 0
      : 1 - recentPriceChanges / maxRecentChanges;

  return (volatilityScore + changesScore) / 2;
}

export function calculateMatchQualityScore(
  semanticScore: number,
  resolutionScore: number
): number {
  return (semanticScore * 0.6 + resolutionScore * 0.4);
}

export function calculateConfidenceScore(
  input: ConfidenceInput,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS
): { score: number; factors: ConfidenceFactors } {
  const freshnessScore = calculateFreshnessScore(
    input.sourceDataAgeMs,
    input.targetDataAgeMs
  );

  const liquidityScore = calculateLiquidityScore(
    input.sourceLiquidity,
    input.targetLiquidity
  );

  const consistencyScore = calculateConsistencyScore(
    input.priceVolatility,
    input.recentPriceChanges
  );

  const matchQualityScore = calculateMatchQualityScore(
    input.semanticScore,
    input.resolutionScore
  );

  const overallScore =
    freshnessScore * weights.freshness +
    liquidityScore * weights.liquidity +
    consistencyScore * weights.consistency +
    matchQualityScore * weights.matchQuality;

  const factors: ConfidenceFactors = {
    freshness: {
      score: freshnessScore,
      sourceAgeMs: input.sourceDataAgeMs,
      targetAgeMs: input.targetDataAgeMs,
      maxAcceptableAgeMs: DEFAULT_THRESHOLDS.maxAcceptableAgeMs,
    },
    liquidity: {
      score: liquidityScore,
      sourceLiquidity: input.sourceLiquidity,
      targetLiquidity: input.targetLiquidity,
      minRequiredLiquidity: DEFAULT_THRESHOLDS.minRequiredLiquidity,
    },
    consistency: {
      score: consistencyScore,
      priceVolatility: input.priceVolatility,
      recentPriceChanges: input.recentPriceChanges,
    },
    matchQuality: {
      score: matchQualityScore,
      semanticScore: input.semanticScore,
      resolutionScore: input.resolutionScore,
    },
  };

  return { score: overallScore, factors };
}
