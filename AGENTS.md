# AGENTS.md

## Dev environment tips
- Use `bunx turbo run <task> --filter <package_name>` to run a task for a single package (e.g. `--filter web`, `--filter @throxy-interview/api`) instead of scanning with `ls`.
- Run `bun install` at the repo root to install dependencies; workspaces are linked automatically. Add new deps in the target package: `bun add <pkg> --cwd apps/web` (or the package path).
- Check the `name` field inside each package's `package.json` to confirm the right name—skip the top-level one. Main packages: `web`, `server`, `@throxy-interview/api`, `@throxy-interview/db`, `@throxy-interview/env`, `@throxy-interview/config`.

## Testing instructions
- If the repo has CI, check the `.github/workflows` folder for the plan.
- Run `bunx turbo run build` (or the relevant task) to verify the monorepo builds.
- From the package root you can run that package’s scripts (e.g. `bun run dev` in `apps/web`). The commit should pass all checks before you merge.
- Fix any type errors: use `bun run check-types` at the repo root, and fix until the suite is green.
- After moving files or changing imports, run `bun run check` at the repo root to run Biome (lint/format). Add or update tests for the code you change when applicable.

## PR instructions
- Title format: `[<package_name>] <Title>` (e.g. `[web] Add dark mode`).
- Always run `bun run check` and `bun run check-types` (and any tests) before committing.

## Hierarchical summarization

- **Use summaries for progressive disclosure.** Start from the root [SUMMARY.md](./SUMMARY.md) (or the SUMMARY.md of the layer your task touches). Get a high-level picture first; follow downlinks into a child layer only when the task requires that detail. Do not load every summary—only the path relevant to the work.
- **One canonical fact per node.** Shared contracts, config patterns, and architectural invariants live in the shallowest node where they are always relevant. Do not duplicate them in child nodes.
- **Update the node when you change a layer.** After changing code in a package or app, update that layer’s `SUMMARY.md` so it stays accurate. Summary files live at the root of the layer they describe (repo root, `packages/<pkg>/`, `apps/<app>/`).

## Workflow & principles

### Planning and execution
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions). If something goes sideways, stop and re-plan — don’t keep pushing.
- Use plan mode for verification steps, not just building. Write detailed specs upfront to reduce ambiguity.
- Prefer **functional programming** style throughout: pure functions, avoid mutable state, compose small functions.

### Verification before done
- Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness.
- When relevant, diff behavior between main and your changes. Ask: “Would a staff engineer approve this?”

### Testing
- Create and run **unit tests for every new feature**; modify existing tests when behavior changes.
- Fix failing tests and CI without being asked. Point at logs/errors, then resolve them.

### Code quality
- For non-trivial changes, pause and ask: “Is there a more elegant way?” Skip for simple, obvious fixes—don’t over-engineer.
- **Simplicity first**: make every change as simple as possible; touch minimal code.
- **No laziness**: find root causes, no temporary fixes. 
- **Minimal impact**: only change what’s necessary.
