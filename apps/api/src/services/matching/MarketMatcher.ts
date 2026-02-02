import natural from 'natural';
import { prisma } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const TfIdf = natural.TfIdf;
const WordTokenizer = natural.WordTokenizer;
const PorterStemmer = natural.PorterStemmer;

interface MatchCandidate {
  sourceMarketId: string;
  targetMarketId: string;
  sourceQuestion: string;
  targetQuestion: string;
  sourcePlatform: string;
  targetPlatform: string;
  semanticScore: number;
  dateScore: number;
  categoryScore: number;
  resolutionScore: number;
  overallScore: number;
  matchedTerms: string[];
  matchReason: string;
  resolutionDiff: string | null;
  isSafe: boolean;
  warnings: string[];
}

export class MarketMatcher {
  private tokenizer = new WordTokenizer();
  private tfidf = new TfIdf();

  // Common prediction market terms to normalize
  private synonymMap: Record<string, string[]> = {
    'trump': ['donald trump', 'trump', 'djt'],
    'biden': ['joe biden', 'biden', 'joseph biden'],
    'president': ['president', 'presidential', 'potus'],
    'election': ['election', 'elected', 'elect', 'voting'],
    'win': ['win', 'victory', 'winner', 'wins'],
    'yes': ['yes', 'affirm', 'true', 'will'],
    'no': ['no', 'deny', 'false', 'wont', "won't"],
    '2024': ['2024', '24'],
    '2025': ['2025', '25'],
    'republican': ['republican', 'gop', 'rep'],
    'democrat': ['democrat', 'dem', 'democratic'],
    'senate': ['senate', 'senator'],
    'house': ['house', 'congress', 'representative'],
    'fed': ['fed', 'federal reserve', 'fomc'],
    'rate': ['rate', 'rates', 'interest'],
    'cut': ['cut', 'lower', 'decrease', 'reduction'],
    'hike': ['hike', 'raise', 'increase'],
    'bitcoin': ['bitcoin', 'btc'],
    'ethereum': ['ethereum', 'eth'],
    'crypto': ['crypto', 'cryptocurrency', 'digital currency'],
  };

  // Date pattern matcher
  private datePatterns = [
    /(\d{4})/g, // Year
    /(january|february|march|april|may|june|july|august|september|october|november|december)/gi,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s\-\.]*\d{1,2}/gi,
    /\d{1,2}[\s\-\.\/]\d{1,2}[\s\-\.\/]\d{2,4}/g, // Various date formats
    /(q[1-4])/gi, // Quarters
    /(by|before|after|end of|beginning of)/gi, // Date qualifiers
  ];

  private normalizeText(text: string): string {
    let normalized = text.toLowerCase();

    // Replace synonyms with canonical forms
    for (const [canonical, synonyms] of Object.entries(this.synonymMap)) {
      for (const synonym of synonyms) {
        const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
        normalized = normalized.replace(regex, canonical);
      }
    }

    return normalized;
  }

  private extractTokens(text: string): string[] {
    const normalized = this.normalizeText(text);
    const tokens = this.tokenizer.tokenize(normalized) || [];
    return tokens.map((t) => PorterStemmer.stem(t));
  }

  private extractDates(text: string): string[] {
    const dates: string[] = [];
    for (const pattern of this.datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        dates.push(...matches.map((m) => m.toLowerCase()));
      }
    }
    return [...new Set(dates)];
  }

  private calculateSemanticScore(question1: string, question2: string): {
    score: number;
    matchedTerms: string[];
  } {
    const tokens1 = this.extractTokens(question1);
    const tokens2 = this.extractTokens(question2);

    if (tokens1.length === 0 || tokens2.length === 0) {
      return { score: 0, matchedTerms: [] };
    }

    // Jaccard similarity
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    const jaccardScore = intersection.size / union.size;

    // TF-IDF cosine similarity
    const tfidf = new TfIdf();
    tfidf.addDocument(tokens1.join(' '));
    tfidf.addDocument(tokens2.join(' '));

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    const allTerms = [...union];
    for (const term of allTerms) {
      const score1 = tfidf.tfidf(term, 0);
      const score2 = tfidf.tfidf(term, 1);
      dotProduct += score1 * score2;
      norm1 += score1 * score1;
      norm2 += score2 * score2;
    }

    const cosineScore = norm1 > 0 && norm2 > 0
      ? dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
      : 0;

    // Combined score
    const combinedScore = (jaccardScore * 0.4 + cosineScore * 0.6);

    return {
      score: Math.min(1, combinedScore),
      matchedTerms: [...intersection],
    };
  }

  private calculateDateScore(question1: string, question2: string): number {
    const dates1 = this.extractDates(question1);
    const dates2 = this.extractDates(question2);

    if (dates1.length === 0 && dates2.length === 0) {
      return 0.5; // Neutral if no dates
    }

    if (dates1.length === 0 || dates2.length === 0) {
      return 0.3; // Penalty if one has dates and other doesn't
    }

    const set1 = new Set(dates1);
    const set2 = new Set(dates2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));

    if (intersection.size === 0) {
      return 0.1; // Very low if no date overlap
    }

    return intersection.size / Math.max(set1.size, set2.size);
  }

  private calculateCategoryScore(cat1: string | null, cat2: string | null): number {
    if (!cat1 || !cat2) return 0.5;

    const norm1 = cat1.toLowerCase().trim();
    const norm2 = cat2.toLowerCase().trim();

    if (norm1 === norm2) return 1.0;

    // Check for related categories
    const relatedCategories: string[][] = [
      ['politics', 'election', 'government', 'congress', 'senate', 'house'],
      ['crypto', 'bitcoin', 'ethereum', 'cryptocurrency'],
      ['sports', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football'],
      ['economy', 'fed', 'rates', 'inflation', 'gdp', 'unemployment'],
      ['entertainment', 'oscars', 'movies', 'music', 'awards'],
    ];

    for (const group of relatedCategories) {
      const has1 = group.some((c) => norm1.includes(c));
      const has2 = group.some((c) => norm2.includes(c));
      if (has1 && has2) return 0.8;
    }

    return 0.3;
  }

  private calculateResolutionScore(
    rules1: string | null,
    source1: string | null,
    rules2: string | null,
    source2: string | null
  ): { score: number; diff: string | null; warnings: string[] } {
    const warnings: string[] = [];

    // If no rules available, we can't compare
    if (!rules1 && !rules2) {
      return { score: 0.5, diff: null, warnings: ['Resolution rules not available for comparison'] };
    }

    if (!rules1 || !rules2) {
      return {
        score: 0.4,
        diff: 'One market has resolution rules, the other does not',
        warnings: ['Incomplete resolution rule comparison'],
      };
    }

    // Check for conflicting resolution sources
    const sources1 = (source1 || '').toLowerCase();
    const sources2 = (source2 || '').toLowerCase();

    if (sources1 && sources2 && sources1 !== sources2) {
      warnings.push(`Different resolution sources: ${source1} vs ${source2}`);
    }

    // Extract key resolution terms
    const ruleTokens1 = this.extractTokens(rules1);
    const ruleTokens2 = this.extractTokens(rules2);

    const set1 = new Set(ruleTokens1);
    const set2 = new Set(ruleTokens2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));

    const overlapRatio = intersection.size / Math.max(set1.size, set2.size);

    // Check for dangerous differences
    const dangerTerms = ['not', 'exclude', 'except', 'only', 'must', 'void', 'cancel'];
    const danger1 = ruleTokens1.filter((t) => dangerTerms.includes(t));
    const danger2 = ruleTokens2.filter((t) => dangerTerms.includes(t));

    if (danger1.length !== danger2.length) {
      warnings.push('Resolution rules may have different conditions/exclusions');
    }

    let diff: string | null = null;
    if (overlapRatio < 0.7) {
      diff = 'Resolution rules have significant differences';
    }

    return {
      score: Math.max(0.2, overlapRatio),
      diff,
      warnings,
    };
  }

  async findMatches(minScore: number = 0.7): Promise<MatchCandidate[]> {
    logger.info('Starting market matching...');

    // Get all active markets
    const markets = await prisma.market.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        platform: true,
        question: true,
        description: true,
        category: true,
        endDate: true,
        resolutionSource: true,
        resolutionRules: true,
        externalId: true,
      },
    });

    // Group by platform
    const byPlatform: Record<string, typeof markets> = {};
    for (const market of markets) {
      const platform = market.platform;
      if (!byPlatform[platform]) byPlatform[platform] = [];
      byPlatform[platform].push(market);
    }

    const platforms = Object.keys(byPlatform);
    const candidates: MatchCandidate[] = [];

    // Compare across platforms
    for (let i = 0; i < platforms.length; i++) {
      for (let j = i + 1; j < platforms.length; j++) {
        const platform1 = platforms[i]!;
        const platform2 = platforms[j]!;
        const markets1 = byPlatform[platform1] || [];
        const markets2 = byPlatform[platform2] || [];

        for (const m1 of markets1) {
          for (const m2 of markets2) {
            // Skip if dates are very different (more than 30 days apart)
            if (m1.endDate && m2.endDate) {
              const daysDiff = Math.abs(
                (m1.endDate.getTime() - m2.endDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysDiff > 30) continue;
            }

            const { score: semanticScore, matchedTerms } = this.calculateSemanticScore(
              m1.question,
              m2.question
            );

            // Quick filter
            if (semanticScore < 0.4) continue;

            const dateScore = this.calculateDateScore(m1.question, m2.question);
            const categoryScore = this.calculateCategoryScore(m1.category, m2.category);
            const { score: resolutionScore, diff: resolutionDiff, warnings } =
              this.calculateResolutionScore(
                m1.resolutionRules,
                m1.resolutionSource,
                m2.resolutionRules,
                m2.resolutionSource
              );

            // Weighted overall score
            const overallScore =
              semanticScore * 0.45 +
              dateScore * 0.20 +
              categoryScore * 0.10 +
              resolutionScore * 0.25;

            if (overallScore < minScore) continue;

            // Generate match reason
            const matchReason = this.generateMatchReason(
              m1.question,
              m2.question,
              matchedTerms,
              semanticScore,
              dateScore,
              resolutionScore
            );

            candidates.push({
              sourceMarketId: m1.id,
              targetMarketId: m2.id,
              sourceQuestion: m1.question,
              targetQuestion: m2.question,
              sourcePlatform: m1.platform,
              targetPlatform: m2.platform,
              semanticScore,
              dateScore,
              categoryScore,
              resolutionScore,
              overallScore,
              matchedTerms,
              matchReason,
              resolutionDiff,
              isSafe: resolutionScore > 0.7 && warnings.length === 0,
              warnings,
            });
          }
        }
      }
    }

    // Sort by overall score
    candidates.sort((a, b) => b.overallScore - a.overallScore);

    logger.info(`Found ${candidates.length} potential market matches`);
    return candidates;
  }

  private generateMatchReason(
    q1: string,
    q2: string,
    matchedTerms: string[],
    semanticScore: number,
    dateScore: number,
    resolutionScore: number
  ): string {
    const parts: string[] = [];

    if (semanticScore > 0.8) {
      parts.push('Very high semantic similarity');
    } else if (semanticScore > 0.6) {
      parts.push('High semantic similarity');
    } else {
      parts.push('Moderate semantic similarity');
    }

    if (matchedTerms.length > 0) {
      parts.push(`Matched terms: ${matchedTerms.slice(0, 5).join(', ')}`);
    }

    if (dateScore > 0.8) {
      parts.push('Matching dates/timeframes');
    } else if (dateScore < 0.5) {
      parts.push('Date alignment uncertain');
    }

    if (resolutionScore > 0.8) {
      parts.push('Similar resolution rules');
    } else if (resolutionScore < 0.5) {
      parts.push('Resolution rules differ - verify manually');
    }

    return parts.join('. ') + '.';
  }

  async saveMatches(candidates: MatchCandidate[]): Promise<number> {
    let saved = 0;

    for (const candidate of candidates) {
      try {
        await prisma.marketMatch.upsert({
          where: {
            sourceMarketId_targetMarketId: {
              sourceMarketId: candidate.sourceMarketId,
              targetMarketId: candidate.targetMarketId,
            },
          },
          create: {
            sourceMarketId: candidate.sourceMarketId,
            targetMarketId: candidate.targetMarketId,
            semanticScore: candidate.semanticScore,
            resolutionScore: candidate.resolutionScore,
            dateScore: candidate.dateScore,
            overallScore: candidate.overallScore,
            matchReason: candidate.matchReason,
            matchedTerms: candidate.matchedTerms,
            resolutionDiff: candidate.resolutionDiff,
            sourcePlatform: candidate.sourcePlatform as 'POLYMARKET' | 'KALSHI' | 'PREDICTIT',
            targetPlatform: candidate.targetPlatform as 'POLYMARKET' | 'KALSHI' | 'PREDICTIT',
            status: candidate.isSafe ? 'PENDING_REVIEW' : 'PENDING_REVIEW',
          },
          update: {
            semanticScore: candidate.semanticScore,
            resolutionScore: candidate.resolutionScore,
            dateScore: candidate.dateScore,
            overallScore: candidate.overallScore,
            matchReason: candidate.matchReason,
            matchedTerms: candidate.matchedTerms,
            resolutionDiff: candidate.resolutionDiff,
          },
        });
        saved++;
      } catch (error) {
        logger.error(`Failed to save match: ${candidate.sourceMarketId} <> ${candidate.targetMarketId}`, error as Error);
      }
    }

    logger.info(`Saved ${saved} market matches`);
    return saved;
  }

  async runMatching(): Promise<void> {
    const candidates = await this.findMatches(0.65);
    await this.saveMatches(candidates);
  }
}

export const marketMatcher = new MarketMatcher();
