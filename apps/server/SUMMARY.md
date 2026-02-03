# server (Hono API)

**Intent:** HTTP server that mounts the tRPC app router. Entrypoint for all API traffic from the web app.

**Scope:** Single app in `src/index.ts`: Hono app with logger, CORS (origin from `@throxy-interview/env/server`), and tRPC mounted at `/trpc/*` via `@hono/trpc-server`. Root route `GET /` returns "OK". No auth; context from Hono only.

**Contracts (canonical):**

- **tRPC:** Router and context come from `@throxy-interview/api` (`appRouter`, `createContext`). Context is created per request from Hono's context.
- **CORS:** `origin: env.CORS_ORIGIN`, methods GET/POST/OPTIONS. Web app must use `NEXT_PUBLIC_SERVER_URL` that matches this origin.

**Downlinks:** None (single-file app).

**Summary:** Server is a thin Hono wrapper: middleware (logger, CORS) and tRPC at `/trpc/*`. All procedure logic lives in `@throxy-interview/api`; server only wires router and context.
