# @throxy-interview/env

**Intent:** Validated environment variables for server and client. Single source of truth for env shape and validation.

**Scope:** Two entrypoints—`@throxy-interview/env/server` and `@throxy-interview/env/web`—each export an `env` object. Server: `createEnv` from `@t3-oss/env-core` with Zod; web: `createEnv` from `@t3-oss/env-nextjs`. Server env is used by API and server app; web env by the Next.js app only.

**Contracts (canonical):**

- **Server env:** `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (optional), `AI_PROVIDER` (enum: openai | anthropic | gemini, default openai). Load with `dotenv/config` in server entrypoints.
- **Web env:** `NEXT_PUBLIC_SERVER_URL` (required). Used for tRPC base URL.
- Import from `@throxy-interview/env/server` or `@throxy-interview/env/web` only; do not read `process.env` directly for these keys in application code.

**Downlinks:** None.

**Summary:** Env package provides validated, typed environment for server (DB, CORS, AI keys, provider) and client (API URL). Facts about which vars exist and where they are used live here.
