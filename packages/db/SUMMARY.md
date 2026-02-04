# @throxy-interview/db

**Intent:** Database schema, Drizzle client, and seed utilities. Canonical place for data model and CSV lead format.

**Scope:** Drizzle ORM + node-postgres (cached `pg.Pool` for serverless). Schema in `src/schema/`, client in `src/index.ts`, seed script in `src/seed.ts`, shared CSV/seed helpers in `src/seed-utils.ts`. Uses `@throxy-interview/env/server` for `DATABASE_URL`.

**Contracts (canonical):**

- **Tables:** `leads` (CSV-imported), `rankings` (AI per-lead, FK to leads), `aiCallLogs` (tokens/cost/duration per call), `prompts` (versioned content, `isActive`, eval score, generation/parent for optimizer). Types exported: `Lead`, `NewLead`, `Ranking`, `NewRanking`, `AiCallLog`, `NewAiCallLog`, `Prompt`, `NewPrompt`.
- **Schema initialization:** `ensureDbSchema()` auto-creates the required tables (and `pgcrypto` extension) when the API starts, so first-run does not require `db:push`.
- **Leads CSV columns (snake_case):** `account_name`, `lead_first_name`, `lead_last_name`, `lead_job_title`, `account_domain`, `account_employee_range`, `account_industry`. Parsed by `parseLeadsCSV` in `seed-utils`.
- **Default prompt:** Stored in `seed-utils` as `DEFAULT_PROMPT`; used by seed and by API `runTestData`. Ranking scale 1–10 or null (irrelevant).
- **Supabase SSL:** When `DATABASE_URL` includes `sslmode=require`, the pool strips `sslmode` from the connection string and sets `ssl.rejectUnauthorized=false` for Supabase pooler connections.
- **Drizzle Kit SSL:** `db:push` applies the same `sslmode=require` normalization and disables cert verification for Supabase pooler URLs.

**Downlinks:** None (schema, seed, and seed-utils are one cohesive layer).

**Summary:** Db package defines the Postgres schema (leads, rankings, aiCallLogs, prompts), exports the Drizzle client and types, and provides CSV parsing and default prompt for seeding. The client reuses a pooled connection across invocations to avoid serverless connection churn.
