# Prediction Market Arbitrage Scanner

A web platform for detecting real, executable arbitrage opportunities between Polymarket and Kalshi prediction markets.

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL (Prisma ORM)
- **Cache**: Redis
- **Monorepo**: Turborepo + pnpm

## Project Structure

```
arbitrage-scanner/
├── apps/
│   ├── api/          # Express backend
│   └── web/          # React frontend
├── packages/
│   ├── shared-types/ # TypeScript types
│   ├── calculations/ # Shared math logic
│   ├── ts-config/    # Shared TS configs
│   └── eslint-config/# Shared ESLint config
└── infrastructure/
    └── docker/       # Docker Compose files
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker and Docker Compose

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Database Services

```bash
cd infrastructure/docker
docker-compose up -d
```

### 3. Set Up Database

```bash
cd apps/api
pnpm db:push
pnpm db:generate
```

### 4. Start Development Servers

From the root directory:

```bash
pnpm dev
```

This starts:
- API server at http://localhost:3001
- Web app at http://localhost:5173

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint all code |
| `pnpm type-check` | TypeScript type checking |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Prisma Studio |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Health check |
| `GET /api/v1/status` | System status |
| `GET /api/v1/markets` | List markets |
| `GET /api/v1/arbitrage` | List arbitrage opportunities |
| `GET /api/v1/arbitrage/:id` | Get opportunity details |

## Environment Variables

Copy `.env.example` to `.env` in the root and `apps/api` directories:

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/arbitrage` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | API server port | `3001` |

## Development

### Database Management

```bash
# Open Prisma Studio (visual database editor)
cd apps/api && pnpm db:studio

# Push schema changes (development)
cd apps/api && pnpm db:push

# Create a migration (production)
cd apps/api && pnpm db:migrate
```

### Adding New Packages

```bash
# Add to a specific app
pnpm add <package> --filter @arbitrage/api
pnpm add <package> --filter @arbitrage/web

# Add to root (dev dependency)
pnpm add -D <package> -w
```

## Architecture

### Data Flow

1. **Ingestion**: Fetch market data from Polymarket/Kalshi APIs
2. **Normalization**: Convert to unified schema
3. **Matching**: NLP-based market matching
4. **Detection**: Fee-aware, liquidity-aware arbitrage detection
5. **Scoring**: Confidence scoring based on freshness, liquidity, consistency
6. **Display**: Real-time UI with polling

### Core Algorithms

- **Spread Calculation**: `Net Spread = Gross Spread - Fees - Slippage`
- **Confidence Score**: Weighted combination of freshness, liquidity, consistency, match quality
- **Market Matching**: Sentence embeddings + resolution rules comparison

## Contributing

1. Create a feature branch
2. Make changes
3. Run `pnpm lint && pnpm type-check`
4. Submit a pull request

## License

MIT
