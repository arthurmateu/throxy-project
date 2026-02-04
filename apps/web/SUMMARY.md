# web (Next.js frontend)

**Intent:** Persona Ranker UI: leads table, import/ranking/export, theme, and tRPC client. All user-facing behavior lives here.

**Scope:** Next.js App Router. `src/app/layout.tsx` (fonts, Providers, Header), `src/app/page.tsx` (single page: stats, DataImport, RankingControls, LeadsTable, ExportButton), and API route handler in `src/app/api/trpc/[trpc]/route.ts`. Components in `src/components/`; tRPC client and React Query in `src/utils/trpc.ts` using `NEXT_PUBLIC_SERVER_URL`. UI uses shadcn-style components under `src/components/ui/`.

**Contracts (canonical):**

- **tRPC client:** `createTRPCClient` + `createTRPCOptionsProxy` from `@trpc/client` / `@trpc/tanstack-react-query`; `httpBatchLink` to `${env.NEXT_PUBLIC_SERVER_URL}/api/trpc`. Use `useTRPC()` in client components for type-safe procedures.
- **Data flow:** Page composes StatsCards, DataImport (CSV import / run test data), RankingControls (start ranking, progress, provider), LeadsTable (paginated/sortable list), ExportButton (top N per company CSV download). All data via tRPC queries/mutations; React Query handles cache and invalidation.

**Downlinks:**

| Area | Summary node | When to open |
|------|--------------|--------------|
| App shell | `src/app/` | Layout, page structure, providers |
| Feature components | `src/components/*.tsx` (excluding ui/) | DataImport, RankingControls, LeadsTable, ExportButton, StatsCards, Header, theme |
| UI primitives | `src/components/ui/` | Buttons, cards, table, dropdown, etc. |
| tRPC/React Query | `src/utils/trpc.ts` | Client setup, base URL, useTRPC |

**Summary:** Web app is a single dashboard page backed by tRPC: stats, lead import and test data, AI ranking with progress, sortable/paginated leads table, and CSV export. Theme and header are in layout; all API calls go through the tRPC client.
