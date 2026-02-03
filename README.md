# Persona Ranker - Throxy Technical Challenge

AI-powered lead qualification and ranking system that scores and ranks leads against an ideal customer persona.

## Quick Start

```bash
# Install dependencies
bun install

# Start Supabase local database
cd packages/db && bunx supabase start

# Configure environment (copy the DATABASE_URL from Supabase output)
# Add to apps/server/.env:
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
# CORS_ORIGIN=http://localhost:3001
# OPENAI_API_KEY=your-key-here  # or ANTHROPIC_API_KEY

# Push database schema
cd packages/db && bun run db:push

# Seed the database with leads
bun run db:seed

# Start development servers
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) to use the application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Leads Table │  │ Ranking UI   │  │ Prompt Optimizer  │  │
│  │ (TanStack)  │  │ (Progress)   │  │ (Genetic Algo)    │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ tRPC
┌────────────────────────────▼────────────────────────────────┐
│                     Backend (Hono)                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Leads API   │  │ Ranking API  │  │ Optimizer API     │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              AI Provider Factory                         ││
│  │    (OpenAI / Anthropic with cost tracking)              ││
│  └─────────────────────────────────────────────────────────┘│
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  PostgreSQL (Supabase)                       │
│    leads │ rankings │ ai_call_logs │ prompts                │
└─────────────────────────────────────────────────────────────┘
```

## Key Decisions

### 1. Hybrid Batch Ranking Strategy
Leads are grouped by company and ranked together in a single AI call. This approach:
- Provides context for relative ranking within the same company
- Reduces API costs by batching
- Maintains consistency in rankings for the same organization

### 2. Dual AI Provider Support
The system supports both OpenAI and Anthropic, allowing:
- Provider comparison for quality/cost trade-offs
- Fallback options if one provider is unavailable
- Flexibility for different ranking tasks

### 3. Genetic Algorithm for Prompt Optimization
The hard challenge uses a genetic algorithm approach:
- **Population**: Multiple prompt variants
- **Fitness**: Measured against pre-ranked eval_set.csv
- **Selection**: Tournament selection of top performers
- **Crossover**: AI combines best elements of two prompts
- **Mutation**: AI modifies prompts based on error patterns

### 4. Cost Tracking
Every AI call is logged with:
- Token counts (input/output)
- Cost calculation based on model pricing
- Duration for performance monitoring
- Batch ID for grouping related calls

## Features Implemented

### MVP
- [x] Load leads into database
- [x] Execute AI ranking from frontend
- [x] Display results in sortable table
- [x] Show lead rankings with reasoning

### Bonus Challenges
- [x] **Easy**: Cost tracking + statistics
- [x] **Easy**: Sortable table by rank
- [x] **Easy**: Export top N leads per company to CSV
- [x] **Medium**: Real-time ranking progress updates
- [x] **Hard**: Automatic prompt optimization (genetic algorithm)

## Tradeoffs

1. **In-memory progress tracking**: Progress for ranking/optimization is stored in memory. For production, this should use Redis or similar.

2. **Single-process optimization**: The genetic algorithm runs in a single process. For larger populations/generations, this could be parallelized.

3. **Simplified fitness function**: Uses rank distance + relevance accuracy. Could be improved with weighted scoring for different rank tiers.

4. **No authentication**: As specified, no auth layer is implemented. Would need to add for production use.

## Project Structure

```
throxy-interview/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   └── src/
│   │       ├── app/            # Pages
│   │       └── components/     # React components
│   └── server/                 # Hono API server
├── packages/
│   ├── api/                    # tRPC routers & services
│   │   └── src/
│   │       ├── routers/        # API endpoints
│   │       └── services/       # Business logic
│   │           ├── ai-provider.ts      # OpenAI/Anthropic abstraction
│   │           ├── ranking.ts          # Lead ranking logic
│   │           └── prompt-optimizer.ts # Genetic algorithm
│   ├── db/                     # Database schema & seed
│   └── env/                    # Environment validation
├── leads.csv                   # Input leads data
├── eval_set.csv               # Pre-ranked evaluation set
└── persona_spec.md            # Ideal customer persona
```

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
CORS_ORIGIN=http://localhost:3001

# AI Providers (at least one required for ranking)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
AI_PROVIDER=openai  # Default provider (openai or anthropic)
```

## Available Scripts

- `bun run dev` - Start all applications in development mode
- `bun run db:push` - Push schema changes to database
- `bun run db:seed` - Seed database with leads.csv
- `bun run db:studio` - Open Drizzle Studio
- `bun run check` - Run linting and formatting
