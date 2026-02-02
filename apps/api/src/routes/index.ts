import { Router } from 'express';

import { getHealth, getStatus, getPlatformHealth } from '../controllers/healthController.js';
import { getMarkets, getMarketById, getMarketOrderbook } from '../controllers/marketsController.js';
import {
  getArbitrageOpportunities,
  getArbitrageById,
  getExecutionPlan,
  getPartialFillScenarios,
} from '../controllers/arbitrageController.js';
import {
  getMatches,
  getMatchById,
  reviewMatch,
} from '../controllers/matchesController.js';
import {
  calculateFees,
  calculateEV,
  convertOdds,
  calculateVig,
} from '../controllers/calculatorController.js';

const router = Router();

// ============== Health & Status ==============
router.get('/health', getHealth);
router.get('/status', getStatus);
router.get('/platforms', getPlatformHealth);

// ============== Markets ==============
router.get('/markets', getMarkets);
router.get('/markets/:id', getMarketById);
router.get('/markets/:id/orderbook', getMarketOrderbook);

// ============== Market Matches ==============
router.get('/matches', getMatches);
router.get('/matches/:id', getMatchById);
router.post('/matches/:id/review', reviewMatch);

// ============== Arbitrage ==============
router.get('/arbitrage', getArbitrageOpportunities);
router.get('/arbitrage/:id', getArbitrageById);
router.get('/arbitrage/:id/execution-plan', getExecutionPlan);
router.get('/arbitrage/:id/partial-fills', getPartialFillScenarios);

// ============== Calculators ==============
router.post('/calculator/fees', calculateFees);
router.post('/calculator/ev', calculateEV);
router.post('/calculator/odds', convertOdds);
router.post('/calculator/vig', calculateVig);

export default router;
