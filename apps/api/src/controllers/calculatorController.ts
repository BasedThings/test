import type { RequestHandler } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';

// Fee calculator
const feeSchema = z.object({
  platform: z.enum(['POLYMARKET', 'KALSHI', 'PREDICTIT']),
  price: z.number().min(0).max(1),
  quantity: z.number().positive(),
  side: z.enum(['BUY', 'SELL']),
});

export const calculateFees: RequestHandler = async (req, res, next) => {
  try {
    const { platform, price, quantity, side } = feeSchema.parse(req.body);

    const feeRates: Record<string, { taker: number; maker: number; profit: number }> = {
      POLYMARKET: { taker: 0.02, maker: 0.00, profit: 0.00 },
      KALSHI: { taker: 0.01, maker: 0.00, profit: 0.00 },
      PREDICTIT: { taker: 0.05, maker: 0.00, profit: 0.10 },
    };

    const rates = feeRates[platform]!;
    const tradeCost = new Decimal(price).times(quantity);
    const takerFee = tradeCost.times(rates.taker);
    const totalCost = side === 'BUY'
      ? tradeCost.plus(takerFee)
      : tradeCost.minus(takerFee);

    // For PredictIt, also calculate potential profit fee
    let profitFee = new Decimal(0);
    if (platform === 'PREDICTIT' && side === 'BUY') {
      const potentialWin = new Decimal(quantity).minus(tradeCost);
      profitFee = potentialWin.times(rates.profit);
    }

    res.json({
      input: { platform, price, quantity, side },
      breakdown: {
        tradeCost: tradeCost.toNumber(),
        takerFee: takerFee.toNumber(),
        takerFeeRate: rates.taker,
        profitFee: profitFee.toNumber(),
        profitFeeRate: rates.profit,
        totalCost: totalCost.toNumber(),
        netProceeds: side === 'SELL' ? totalCost.toNumber() : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

// EV Calculator
const evSchema = z.object({
  probability: z.number().min(0).max(1),
  price: z.number().min(0).max(1),
  quantity: z.number().positive(),
  feeRate: z.number().min(0).max(0.5).default(0.02),
  outcome: z.enum(['YES', 'NO']),
});

export const calculateEV: RequestHandler = async (req, res, next) => {
  try {
    const { probability, price, quantity, feeRate, outcome } = evSchema.parse(req.body);

    const p = outcome === 'YES' ? probability : 1 - probability;
    const cost = new Decimal(price).times(quantity);
    const fee = cost.times(feeRate);
    const totalCost = cost.plus(fee);

    // Win: receive $quantity, lose cost
    const winPayout = new Decimal(quantity);
    const winProfit = winPayout.minus(totalCost);
    const lossProfit = new Decimal(0).minus(totalCost);

    const ev = new Decimal(p).times(winProfit).plus(new Decimal(1 - p).times(lossProfit));
    const evPerDollar = ev.dividedBy(totalCost);

    // Kelly criterion for optimal sizing
    const edge = new Decimal(p).minus(price);
    const kellyCriterion = edge.dividedBy(1 - price);

    res.json({
      input: { probability, price, quantity, feeRate, outcome },
      results: {
        expectedValue: ev.toNumber(),
        evPerDollar: evPerDollar.toNumber(),
        evPercentage: evPerDollar.times(100).toNumber(),
        totalCost: totalCost.toNumber(),
        potentialProfit: winProfit.toNumber(),
        potentialLoss: lossProfit.toNumber(),
        edge: edge.toNumber(),
        kellyFraction: Math.max(0, kellyCriterion.toNumber()),
        recommendation: ev.isPositive() ? 'POSITIVE_EV' : 'NEGATIVE_EV',
      },
    });
  } catch (error) {
    next(error);
  }
};

// Odds Converter
const oddsSchema = z.object({
  value: z.number(),
  from: z.enum(['probability', 'decimal', 'american', 'fractional', 'implied']),
});

export const convertOdds: RequestHandler = async (req, res, next) => {
  try {
    const { value, from } = oddsSchema.parse(req.body);

    let probability: number;

    // Convert to probability first
    switch (from) {
      case 'probability':
        probability = value;
        break;
      case 'decimal':
        probability = 1 / value;
        break;
      case 'american':
        if (value > 0) {
          probability = 100 / (value + 100);
        } else {
          probability = Math.abs(value) / (Math.abs(value) + 100);
        }
        break;
      case 'fractional':
        probability = 1 / (value + 1);
        break;
      case 'implied':
        probability = value / 100;
        break;
    }

    // Validate probability
    probability = Math.max(0.001, Math.min(0.999, probability));

    // Convert from probability to all formats
    const decimal = 1 / probability;
    let american: number;
    if (probability > 0.5) {
      american = -(probability / (1 - probability)) * 100;
    } else {
      american = ((1 - probability) / probability) * 100;
    }
    const fractional = (1 - probability) / probability;

    res.json({
      conversions: {
        probability: probability,
        implied: probability * 100,
        decimal: Math.round(decimal * 100) / 100,
        american: Math.round(american),
        fractional: `${Math.round(fractional * 100) / 100}/1`,
        price: probability, // Same as probability for prediction markets
      },
    });
  } catch (error) {
    next(error);
  }
};

// Vig Calculator
const vigSchema = z.object({
  yesPrice: z.number().min(0).max(1),
  noPrice: z.number().min(0).max(1),
});

export const calculateVig: RequestHandler = async (req, res, next) => {
  try {
    const { yesPrice, noPrice } = vigSchema.parse(req.body);

    const overround = yesPrice + noPrice;
    const vig = overround - 1;
    const vigPercentage = vig * 100;

    // Calculate no-vig (fair) prices
    const fairYes = yesPrice / overround;
    const fairNo = noPrice / overround;

    // Calculate implied edge for each side
    const yesEdge = fairYes - yesPrice;
    const noEdge = fairNo - noPrice;

    res.json({
      input: { yesPrice, noPrice },
      results: {
        overround: overround,
        vig: vig,
        vigPercentage: vigPercentage,
        fairPrices: {
          yes: fairYes,
          no: fairNo,
        },
        edges: {
          buyYes: yesEdge, // Positive means value
          buyNo: noEdge,
        },
        recommendation: vigPercentage < 5 ? 'LOW_VIG' : vigPercentage < 10 ? 'MODERATE_VIG' : 'HIGH_VIG',
      },
    });
  } catch (error) {
    next(error);
  }
};
