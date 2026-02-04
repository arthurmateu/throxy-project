import { sql } from "drizzle-orm";
import { db } from "./index";

const globalForSchema = globalThis as typeof globalThis & {
	schemaReady?: Promise<void>;
};

const runSchemaInit = async () => {
	try {
		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS leads (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				account_name text NOT NULL,
				first_name text NOT NULL,
				last_name text NOT NULL,
				job_title text NOT NULL,
				account_domain text,
				employee_range text,
				industry text,
				created_at timestamp NOT NULL DEFAULT now()
			);
		`);

		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS rankings (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
				rank integer,
				relevance_score real,
				reasoning text,
				prompt_version integer DEFAULT 1,
				created_at timestamp NOT NULL DEFAULT now()
			);
		`);

		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS ai_call_logs (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				provider text NOT NULL,
				model text NOT NULL,
				input_tokens integer NOT NULL,
				output_tokens integer NOT NULL,
				cost real NOT NULL,
				duration_ms integer NOT NULL,
				prompt_version integer DEFAULT 1,
				batch_id text,
				created_at timestamp NOT NULL DEFAULT now()
			);
		`);

		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS prompts (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				version integer NOT NULL UNIQUE,
				content text NOT NULL,
				eval_score real,
				is_active boolean DEFAULT false,
				generation integer,
				parent_version integer,
				created_at timestamp NOT NULL DEFAULT now()
			);
		`);
	} catch (error) {
		globalForSchema.schemaReady = undefined;
		throw error;
	}
};

export const ensureDbSchema = async () => {
	if (!globalForSchema.schemaReady) {
		globalForSchema.schemaReady = runSchemaInit();
	}

	return globalForSchema.schemaReady;
};
