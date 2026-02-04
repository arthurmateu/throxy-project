# Project summary (root)

**Intent:** High-level map of the repo. Use this first; follow downlinks only where the task requires detail.

**Scope:** Monorepo (bun workspaces, Turbo). Lead qualification app: import leads from CSV, rank them with AI, export top leads per company.

**Contracts (canonical):**

- **Package names:** Use `name` from each package's `package.json`. Main: `web`, `server`, `@throxy-interview/api`, `@throxy-interview/db`, `@throxy-interview/env`, `@throxy-interview/config`.
- **Running tasks:** `bunx turbo run <task> --filter <package_name>`; deps installed at root with `bun install`.
- **Type/lint:** `bun run check-types` and `bun run check` at root.

**Downlinks:**

| Area | Summary node | When to open |
|------|--------------|--------------|
| Database (schema, seed, CSV) | [packages/db/SUMMARY.md](./packages/db/SUMMARY.md) | Data model, seeding, leads CSV format |
| API (tRPC, ranking, export) | [packages/api/SUMMARY.md](./packages/api/SUMMARY.md) | Backend procedures, AI, ranking, export |
| Environment (server vs client) | [packages/env/SUMMARY.md](./packages/env/SUMMARY.md) | Env vars, validation |
| Shared TypeScript config | [packages/config/SUMMARY.md](./packages/config/SUMMARY.md) | TS/base config |
| Next.js frontend | [apps/web/SUMMARY.md](./apps/web/SUMMARY.md) | UI, pages, components |
| Hono API server | [apps/server/SUMMARY.md](./apps/server/SUMMARY.md) | HTTP, CORS, tRPC mount |

**Summary:** Apps: `web` (Next.js, Persona Ranker UI) and `server` (Hono, tRPC). Packages: `db` (Drizzle, leads/rankings/prompts/aiCallLogs), `api` (tRPC app router: leads, ranking, export), `env` (server + web validated env), `config` (shared tsconfig). Data flow: CSV → leads; active prompt + AI → rankings; export → top N per company; tRPC served at `/api/trpc/*` for Vercel.
