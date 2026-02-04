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
# OPENAI_API_KEY=your-key-here  # or ANTHROPIC_API_KEY or GEMINI_API_KEY

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
│                     Frontend (Next.js)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Leads Table │  │ Ranking UI   │  │                   │   │
│  │ (TanStack)  │  │ (Progress)   │  │                   │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ tRPC
┌────────────────────────────▼───────────────────────────────┐
│                     Backend (Hono)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Leads API   │  │ Ranking API  │  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐│
│  │              AI Provider Factory                       ││
│  │    (OpenAI / Anthropic with cost tracking)             ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────┬───────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  PostgreSQL (Supabase)                      │
│    leads │ rankings │ ai_call_logs │ prompts                │
└─────────────────────────────────────────────────────────────┘
```

## Key Decisions

### 1. Hybrid Batch Ranking Strategy
Leads are grouped by company and ranked together in a single AI call. This approach:
- Provides context for relative ranking within the same company
- Reduces API costs by batching
- Maintains consistency in rankings for the same organization

### 2. AI Provider Support
The system supports multiple AI providers for ranking:
- **OpenAI** (GPT-4o-mini and others)
- **Anthropic** (Claude models)
- **Google Gemini** (Gemini 2.0 Flash and others)

You can configure one or more providers via environment variables and choose which to use when running ranking.

### 3. Cost Tracking
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
- [ ] **Hard**: Automatic prompt optimization (genetic algorithm)

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
│   │           ├── ai-provider.ts      # OpenAI / Anthropic / Gemini
│   │           └── ranking.ts          # Lead ranking logic
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
GEMINI_API_KEY=...   # From Google AI Studio (https://aistudio.google.com/apikey)

# Optional
AI_PROVIDER=openai   # Default provider: openai | anthropic | gemini
```

## Vercel Deployment Checklist

- Set the Vercel project root to `apps/web` (single project).
- Build command: `bunx turbo run build --filter web`
- Output directory: `.next`
- Environment variables in Vercel:
  - `NEXT_PUBLIC_SERVER_URL` = your Vercel deployment URL (same origin)
  - `DATABASE_URL` = production Postgres connection string
  - Supabase on Vercel: use the pooler URL (Transaction pooler) and include `sslmode=require` unless you provide a CA for `sslmode=verify-full`
    - Example: `postgresql://postgres:<password>@<project>.pooler.supabase.com:6543/postgres?sslmode=require`
  - `CORS_ORIGIN` = same origin as `NEXT_PUBLIC_SERVER_URL`
  - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` (at least one)
  - `AI_PROVIDER` (optional; default `openai`)
- Turbo repo note: keep these env vars listed under `tasks.build.env` in `turbo.json` so Vercel passes them through.
- Verify the API is reachable at `https://<your-domain>/api/trpc`

### Supported AI providers
- **OpenAI** – set `OPENAI_API_KEY` for GPT models (e.g. gpt-4o-mini).
- **Anthropic** – set `ANTHROPIC_API_KEY` for Claude models.
- **Google Gemini** – set `GEMINI_API_KEY` for Gemini models (e.g. gemini-2.0-flash). Get a key from [Google AI Studio](https://aistudio.google.com/apikey).

## Available Scripts

- `bun run dev` - Start all applications in development mode
- `bun run db:push` - Push schema changes to database
- `bun run db:seed` - Seed database with leads.csv
- `bun run db:studio` - Open Drizzle Studio
- `bun run check` - Run linting and formatting
