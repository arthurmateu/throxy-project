import { env } from "@throxy-interview/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
	pgPool?: Pool;
};

const buildPool = () => {
	const connectionString = env.DATABASE_URL;
	const shouldUseSsl =
		connectionString.includes("sslmode=require") ||
		connectionString.includes("supabase.co");

	return new Pool({
		connectionString,
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
