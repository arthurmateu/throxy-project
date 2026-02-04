# @throxy-interview/api

**Intent:** tRPC app router and backend procedures: leads, ranking, export, optimizer. All AI and business logic lives here.

**Scope:** `src/index.ts` creates tRPC instance and `publicProcedure`; `src/context.ts` provides Hono-based context (no auth). Routers in `src/routers/`, services in `src/services/`. Uses `@throxy-interview/db`, `@throxy-interview/env/server`, and internal services for AI and ranking.

**Contracts (canonical):**

- **Router surface:** `appRouter` from `src/routers/index.ts`; type `AppRouter` for client. Procedures: `healthCheck`, `leads.list` / `leads.stats` / `leads.importFromCsv` / `leads.runTestData` / `leads.clearAll`, `ranking.start` / `ranking.progress` / `ranking.changes` / `ranking.availableProviders`, `optimizer.start` / `optimizer.startSession` / `optimizer.progress` / `optimizer.history` / `optimizer.activate` / `optimizer.evalSetInfo`, `export.topLeadsPerCompany`.
- **AI providers:** openai, anthropic, gemini. Config from env; init via `initAIProvider` in routers that need AI. Ranking and optimization run as background processes keyed by `batchId`/`runId`; progress stored in-memory (Map). Session optimization can override the ranking prompt in-memory, capture ranking deltas after rerank, and session-scoped AI stats are derived from session batch IDs.
- **Prompt fallback:** Ranking auto-creates the default prompt if no active prompt exists, so first-run ranking can proceed without manual seeding.
- **DB bootstrap:** API context calls `ensureDbSchema()` so tables exist before handling requests.

**Downlinks:**

| Area | Summary node | When to open |
|------|--------------|--------------|
| Routers | (this file) | Procedure names, input shapes, which service they call |
| Services: AI provider | `src/services/ai-provider.ts` | Multi-provider chat, pricing, `getAIProvider` / `initAIProvider` |
| Services: Ranking | `src/services/ranking.ts` | Ranking process, prompt building, progress, DB writes for rankings/aiCallLogs |

**Summary:** API package is the tRPC backend: leads CRUD/import/clear, AI ranking (per-company batches, progress polling), session-based prompt optimization, and export (top N per company). Services encapsulate AI calls and ranking pipeline, and leads list queries join the latest ranking per lead while logging DB failures before returning a user-facing error.
