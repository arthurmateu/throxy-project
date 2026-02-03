# ═══════════════════════════════════════════════════════════════════════════════
#  throxy-interview — Monorepo Makefile
# ═══════════════════════════════════════════════════════════════════════════════

.PHONY: help dev dev-web dev-server build check-types check db-push db-studio db-generate db-migrate db-seed install clean

# ------------------------------------------------------------------------------
#  Default: show help
# ------------------------------------------------------------------------------
help:
	@echo ""
	@echo "  \033[1;36mthroxy-interview\033[0m — available commands"
	@echo "  \033[90m────────────────────────────────────────────\033[0m"
	@echo ""
	@echo "  \033[1;33mDevelopment\033[0m"
	@echo "    make dev          Run all apps in dev mode (turbo)"
	@echo "    make dev-web      Run Next.js web app only (port 3001)"
	@echo "    make dev-server   Run API server only (hot reload)"
	@echo ""
	@echo "  \033[1;33mBuild & types\033[0m"
	@echo "    make build       Build all packages and apps"
	@echo "    make check-types Run TypeScript type checking"
	@echo "    make check       Lint and format with Biome (--write)"
	@echo ""
	@echo "  \033[1;33mDatabase (Drizzle)\033[0m"
	@echo "    make db-push     Push schema to DB (drizzle-kit push)"
	@echo "    make db-studio   Open Drizzle Studio"
	@echo "    make db-generate Generate migrations"
	@echo "    make db-migrate  Run migrations"
	@echo "    make db-seed     Run seed script"
	@echo ""
	@echo "  \033[1;33mSetup\033[0m"
	@echo "    make install     Install dependencies (bun install)"
	@echo "    make clean       Remove build artifacts"
	@echo ""

# ------------------------------------------------------------------------------
#  Development
# ------------------------------------------------------------------------------
dev:
	bun run dev

dev-web:
	bun run dev:web

dev-server:
	bun run dev:server

# ------------------------------------------------------------------------------
#  Build & type-check
# ------------------------------------------------------------------------------
build:
	bun run build

check-types:
	bun run check-types

check:
	bun run check

# ------------------------------------------------------------------------------
#  Database
# ------------------------------------------------------------------------------
db-push:
	bun run db:push

db-studio:
	bun run db:studio

db-generate:
	bun run db:generate

db-migrate:
	bun run db:migrate

db-seed:
	cd packages/db && bun run db:seed

# ------------------------------------------------------------------------------
#  Setup & cleanup
# ------------------------------------------------------------------------------
install:
	bun install

clean:
	rm -rf apps/server/dist apps/web/.next
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	@echo "Cleaned build artifacts and node_modules."
