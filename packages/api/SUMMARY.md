# @throxy-interview/api

**Intent:** tRPC app router and backend procedures: leads, ranking, export. All AI and business logic lives here.

**Scope:** `src/index.ts` creates tRPC instance and `publicProcedure`; `src/context.ts` provides Hono-based context (no auth). Routers in `src/routers/`, services in `src/services/`. Uses `@throxy-interview/db`, `@throxy-interview/env/server`, and internal services for AI and ranking.

**Contracts (canonical):**

- **Router surface:** `appRouter` from `src/routers/index.ts`; type `AppRouter` for client. Procedures: `healthCheck`, `leads.list` / `leads.stats` / `leads.importFromCsv` / `leads.runTestData`, `ranking.start` / `ranking.progress` / `ranking.availableProviders`, `export.topLeadsPerCompany`.
- **AI providers:** openai, anthropic, gemini. Config from env; init via `initAIProvider` in routers that need AI. Ranking runs a background process keyed by `batchId`; progress stored in-memory (Map).

**Downlinks:**

| Area | Summary node | When to open |
|------|--------------|--------------|
| Routers | (this file) | Procedure names, input shapes, which service they call |
| Services: AI provider | `src/services/ai-provider.ts` | Multi-provider chat, pricing, `getAIProvider` / `initAIProvider` |
| Services: Ranking | `src/services/ranking.ts` | Ranking process, prompt building, progress, DB writes for rankings/aiCallLogs |

**Summary:** API package is the tRPC backend: leads CRUD and import, AI ranking (per-company batches, progress polling), export (top N per company). Services encapsulate AI calls and ranking pipeline; routers wire env and input validation.
