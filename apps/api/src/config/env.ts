import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  // Railway provides these automatically
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Railway-managed PostgreSQL (DATABASE_URL or POSTGRES_*)
  DATABASE_URL: z.string().url(),

  // Railway-managed Redis (REDIS_URL or REDIS_*)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // CORS
  CORS_ORIGIN: z.string().optional(),

  // API Rate Limits
  POLYMARKET_RATE_LIMIT_PER_MIN: z.coerce.number().default(100),
  KALSHI_RATE_LIMIT_PER_MIN: z.coerce.number().default(30),
  PREDICTIT_RATE_LIMIT_PER_MIN: z.coerce.number().default(20),

  // Data freshness thresholds (ms)
  PRICE_STALE_THRESHOLD_MS: z.coerce.number().default(5000),
  ORDERBOOK_STALE_THRESHOLD_MS: z.coerce.number().default(3000),

  // Arbitrage detection
  MIN_ARBITRAGE_SPREAD_PCT: z.coerce.number().default(0.5),
  MIN_CONFIDENCE_SCORE: z.coerce.number().default(0.6),
  MIN_EXECUTABLE_SIZE_USD: z.coerce.number().default(10),

  // Worker settings
  INGESTION_INTERVAL_MS: z.coerce.number().default(2000),
  ARBITRAGE_SCAN_INTERVAL_MS: z.coerce.number().default(1000),
  MATCHING_INTERVAL_MS: z.coerce.number().default(60000),

  // Optional: Kalshi API credentials
  KALSHI_API_EMAIL: z.string().optional(),
  KALSHI_API_PASSWORD: z.string().optional(),

  // Feature flags
  ENABLE_POLYMARKET: z.coerce.boolean().default(true),
  ENABLE_KALSHI: z.coerce.boolean().default(true),
  ENABLE_PREDICTIT: z.coerce.boolean().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

// Railway-specific helpers
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
