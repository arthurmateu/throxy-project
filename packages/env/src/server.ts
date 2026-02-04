import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		CORS_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		// AI Provider keys (at least one required for ranking)
		OPENAI_API_KEY: z.string().optional(),
		ANTHROPIC_API_KEY: z.string().optional(),
		GEMINI_API_KEY: z.string().optional(),
		// Default AI provider to use
		AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).default("openai"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
