import { ensureDbSchema } from "@throxy-interview/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext(_opts: CreateContextOptions) {
	await ensureDbSchema();
	// No auth configured
	return {
		session: null,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
