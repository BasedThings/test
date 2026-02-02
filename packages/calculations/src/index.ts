// Spread calculations
export {
  calculateGrossSpread,
  calculateSpread,
  calculateMaxProfitableSize,
  calculateROI,
  calculateAnnualizedROI,
  type SpreadCalculationInput,
  type SpreadResult,
} from './spread.js';

// Fee calculations
export {
  FEES,
  calculateTradeFee,
  calculateTotalFees,
  getBreakEvenSpread,
  type PlatformFees,
} from './fees.js';

// Slippage estimation
export {
  estimateSlippage,
  estimateCombinedSlippage,
  calculateSlippageImpact,
  type SlippageEstimate,
} from './slippage.js';

// Confidence scoring
export {
  calculateConfidenceScore,
  calculateFreshnessScore,
  calculateLiquidityScore,
  calculateConsistencyScore,
  calculateMatchQualityScore,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type ConfidenceInput,
  type ConfidenceWeights,
} from './confidence.js';

// Execution planning
export {
  generateExecutionPlan,
  type ExecutionPlanInput,
} from './execution.js';
