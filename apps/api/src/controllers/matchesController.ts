import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const matchesQuerySchema = z.object({
  status: z.enum(['PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'all']).default('all'),
  minScore: z.coerce.number().min(0).max(1).optional(),
  sortBy: z.enum(['overallScore', 'semanticScore', 'createdAt']).default('overallScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const getMatches: RequestHandler = async (req, res, next) => {
  try {
    const query = matchesQuerySchema.parse(req.query);

    const where: Record<string, unknown> = {};

    if (query.status !== 'all') {
      where.status = query.status;
    }

    if (query.minScore !== undefined) {
      where.overallScore = { gte: query.minScore };
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[query.sortBy] = query.sortOrder;

    const [matches, total] = await Promise.all([
      prisma.marketMatch.findMany({
        where,
        orderBy,
        take: query.limit,
        skip: query.offset,
        include: {
          sourceMarket: {
            select: {
              id: true,
              platform: true,
              question: true,
              yesPrice: true,
              noPrice: true,
              sourceUrl: true,
              resolutionRules: true,
            },
          },
          targetMarket: {
            select: {
              id: true,
              platform: true,
              question: true,
              yesPrice: true,
              noPrice: true,
              sourceUrl: true,
              resolutionRules: true,
            },
          },
        },
      }),
      prisma.marketMatch.count({ where }),
    ]);

    res.json({
      data: matches.map((m: typeof matches[number]) => ({
        ...m,
        semanticScore: m.semanticScore.toNumber(),
        resolutionScore: m.resolutionScore.toNumber(),
        dateScore: m.dateScore.toNumber(),
        overallScore: m.overallScore.toNumber(),
        sourceMarket: {
          ...m.sourceMarket,
          yesPrice: m.sourceMarket.yesPrice.toNumber(),
          noPrice: m.sourceMarket.noPrice.toNumber(),
        },
        targetMarket: {
          ...m.targetMarket,
          yesPrice: m.targetMarket.yesPrice.toNumber(),
          noPrice: m.targetMarket.noPrice.toNumber(),
        },
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + matches.length < total,
      },
      meta: { fetchedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

export const getMatchById: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    const match = await prisma.marketMatch.findUnique({
      where: { id },
      include: {
        sourceMarket: true,
        targetMarket: true,
        arbitrageOpps: {
          where: { status: 'ACTIVE' },
          orderBy: { detectedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!match) {
      throw new AppError(404, 'NOT_FOUND', 'Match not found');
    }

    res.json({
      data: {
        ...match,
        semanticScore: match.semanticScore.toNumber(),
        resolutionScore: match.resolutionScore.toNumber(),
        dateScore: match.dateScore.toNumber(),
        overallScore: match.overallScore.toNumber(),
      },
      explanation: {
        semanticAnalysis: `Semantic similarity score: ${(match.semanticScore.toNumber() * 100).toFixed(1)}%`,
        resolutionComparison: match.resolutionDiff || 'Resolution rules appear compatible',
        matchedTerms: match.matchedTerms,
        recommendation: match.overallScore.toNumber() > 0.8 ? 'SAFE' : 'CAUTION',
      },
      meta: { fetchedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

const reviewSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
  notes: z.string().optional(),
});

export const reviewMatch: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = reviewSchema.parse(req.body);

    const match = await prisma.marketMatch.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    res.json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
};
