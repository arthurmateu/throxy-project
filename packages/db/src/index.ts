import { env } from "@throxy-interview/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export { ensureDbSchema } from "./ensure-schema";

const globalForDb = globalThis as typeof globalThis & {
	pgPool?: Pool;
};

const normalizeConnectionString = (connectionString: string) => {
	try {
		const parsedUrl = new URL(connectionString);
		const sslmode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();
		const shouldStripSslmode = sslmode === "require";

		if (shouldStripSslmode) {
			parsedUrl.searchParams.delete("sslmode");
			return { connectionString: parsedUrl.toString(), sslmode };
		}

		return { connectionString, sslmode };
	} catch {
		return { connectionString, sslmode: undefined };
	}
};

const buildPool = () => {
	const connectionString = env.DATABASE_URL;
	const { connectionString: normalizedConnectionString, sslmode } =
		normalizeConnectionString(connectionString);
	const shouldUseSsl =
		sslmode === "require" ||
		/sslmode=require/i.test(connectionString) ||
		connectionString.includes("supabase.co");

	return new Pool({
		connectionString: normalizedConnectionString,
		max: 5,
		allowExitOnIdle: true,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: 10_000,
		ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
	});
};

const pool = globalForDb.pgPool ?? buildPool();
globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
