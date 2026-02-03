# @throxy-interview/api

**Intent:** tRPC app router and backend procedures: leads, ranking, export, prompt optimizer. All AI and business logic lives here.

**Scope:** `src/index.ts` creates tRPC instance and `publicProcedure`; `src/context.ts` provides Hono-based context (no auth). Routers in `src/routers/`, services in `src/services/`. Uses `@throxy-interview/db`, `@throxy-interview/env/server`, and internal services for AI and ranking.

**Contracts (canonical):**

- **Router surface:** `appRouter` from `src/routers/index.ts`; type `AppRouter` for client. Procedures: `healthCheck`, `leads.list` / `leads.stats` / `leads.importFromCsv` / `leads.runTestData`, `ranking.start` / `ranking.progress` / `ranking.availableProviders`, `export.topLeadsPerCompany`, `optimizer.start` / `optimizer.progress` / `optimizer.history` / `optimizer.activate` / `optimizer.evalSetInfo`.
- **AI providers:** openai, anthropic, openrouter. Config from env; init via `initAIProvider` in routers that need AI. Ranking and optimizer run background processes keyed by `batchId` / `runId`; progress stored in-memory (Map).
- **Eval set:** `eval_set.csv` parsed by `parseEvalSet` in `prompt-optimizer` service; columns include fullName, title, company, expectedRank (- for irrelevant). Used only by optimizer.

**Downlinks:**

| Area | Summary node | When to open |
|------|--------------|--------------|
| Routers | (this file) | Procedure names, input shapes, which service they call |
| Services: AI provider | `src/services/ai-provider.ts` | Multi-provider chat, pricing, `getAIProvider` / `initAIProvider` |
| Services: Ranking | `src/services/ranking.ts` | Ranking process, prompt building, progress, DB writes for rankings/aiCallLogs |
| Services: Prompt optimizer | `src/services/prompt-optimizer.ts` | Genetic algorithm, eval set parsing, fitness, mutate/crossover, activate prompt |

**Summary:** API package is the tRPC backend: leads CRUD and import, AI ranking (per-company batches, progress polling), export (top N per company), and prompt optimization (eval_set, genetic evolution, activate version). Services encapsulate AI calls, ranking pipeline, and optimizer logic; routers wire env and input validation.
