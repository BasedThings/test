import type { MarketSummary } from './market.js';
import type { MatchStatus, Platform } from './platform.js';

export interface MarketMatch {
  id: string;

  // Markets being matched
  sourceMarketId: string;
  targetMarketId: string;

  // Match quality scores (0-1)
  semanticScore: number;
  resolutionScore: number;
  dateScore: number;
  overallScore: number;

  // Match explainability
  matchReason: string;
  matchedTerms: string[];
  resolutionDiff?: string;

  // Status
  status: MatchStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;

  // Denormalized for queries
  sourcePlatform: Platform;
  targetPlatform: Platform;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface MarketMatchWithMarkets extends MarketMatch {
  sourceMarket: MarketSummary;
  targetMarket: MarketSummary;
}

export interface MatchExplanation {
  semanticAnalysis: string;
  resolutionComparison: string;
  dateAlignment: string;
  risks: string[];
  recommendation: 'SAFE' | 'CAUTION' | 'UNSAFE';
}

export interface MatchReviewRequest {
  status: 'CONFIRMED' | 'REJECTED';
  notes?: string;
}
