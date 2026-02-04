import "dotenv/config";
import { createEnv, type StandardSchemaDictionary } from "@t3-oss/env-core";
import { z } from "zod";

const serverSchema = {
	DATABASE_URL: z.string().min(1),
	CORS_ORIGIN: z.string().url(),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	// AI Provider keys (at least one required for ranking)
	OPENAI_API_KEY: z.string().optional(),
	ANTHROPIC_API_KEY: z.string().optional(),
	GEMINI_API_KEY: z.string().optional(),
	// Default AI provider to use
	AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).default("openai"),
} satisfies StandardSchemaDictionary;

/** Output type for server env (preserved when using type assertion below). */
interface ServerEnv {
	DATABASE_URL: string;
	CORS_ORIGIN: string;
	NODE_ENV: "development" | "production" | "test";
	OPENAI_API_KEY?: string;
	ANTHROPIC_API_KEY?: string;
	GEMINI_API_KEY?: string;
	AI_PROVIDER: "openai" | "anthropic" | "gemini";
}

// Type assertion: @t3-oss/env-core's conditional types expect ErrorMessage when TPrefix
// is inferred as string (server-only config). Bypass input types and assert output type.
export const env = createEnv({
	server: serverSchema,
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
}) as Readonly<ServerEnv>;
