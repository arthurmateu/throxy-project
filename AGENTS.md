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
