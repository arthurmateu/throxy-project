import { env } from "@throxy-interview/env/server";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import {
	type AIProvider,
	type AIProviderConfig,
	getAvailableProviders,
	initAIProvider,
} from "../services/ai-provider";
import {
	getRankingProgress,
	type RankingProgress,
	runRankingProcess,
} from "../services/ranking";

// ============================================================================
// Shared Utilities
// ============================================================================

/** Get the AI provider config from environment */
const getProviderConfig = (): AIProviderConfig => ({
	openaiApiKey: env.OPENAI_API_KEY,
	anthropicApiKey: env.ANTHROPIC_API_KEY,
	openrouterApiKey: env.OPENROUTER_API_KEY,
});

/** Initialize AI provider from environment */
const initializeAIProvider = () => {
	const config = getProviderConfig();
	return initAIProvider(
		config.openaiApiKey,
		config.anthropicApiKey,
		config.openrouterApiKey,
	);
};

/** Get the provider to use (from input or default) */
const resolveProvider = (inputProvider?: AIProvider): AIProvider =>
	inputProvider ?? (env.AI_PROVIDER as AIProvider);

/** Generate a unique batch ID */
const generateBatchId = (): string => `batch_${Date.now()}`;

// ============================================================================
// Input Schemas
// ============================================================================

const startInputSchema = z
	.object({
		provider: z.enum(["openai", "anthropic", "openrouter"]).optional(),
	})
	.optional();

const progressInputSchema = z.object({
	batchId: z.string(),
});

// ============================================================================
// Router
// ============================================================================

export const rankingRouter = router({
	start: publicProcedure.input(startInputSchema).mutation(async ({ input }) => {
		initializeAIProvider();

		const provider = resolveProvider(input?.provider);
		const batchId = generateBatchId();

		// Start the ranking process in the background
		runRankingProcess(provider, batchId).catch((error) => {
			console.error("Ranking process failed:", error);
		});

		return { batchId, message: "Ranking process started" };
	}),

	progress: publicProcedure
		.input(progressInputSchema)
		.query(
			async ({ input }): Promise<RankingProgress> =>
				getRankingProgress(input.batchId),
		),

	availableProviders: publicProcedure.query(async () => ({
		providers: getAvailableProviders(getProviderConfig()),
		defaultProvider: env.AI_PROVIDER as AIProvider,
	})),
});
