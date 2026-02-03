# @throxy-interview/config

**Intent:** Shared TypeScript/base config for the monorepo. No runtime code.

**Scope:** Single file `tsconfig.base.json` used by apps and packages via `extends`. Defines strict compiler options, ESNext module/target, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `types: ["bun"]`.

**Contracts (canonical):**

- Other packages extend this via `"extends": "@throxy-interview/config/tsconfig.base.json"` (or equivalent path). Do not duplicate compiler options; override only when necessary.

**Downlinks:** None.

**Summary:** Config package exposes a base tsconfig for consistent TypeScript settings across the repo. No downlinks; this is a leaf node.
