import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "@throxy-interview/env/server";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import {
	type AIProvider,
	type AIProviderConfig,
	initAIProvider,
} from "../services/ai-provider";
import {
	activatePrompt,
	type EvalLead,
	getOptimizationHistory,
	getOptimizationProgress,
	type OptimizationProgress,
	parseEvalSet,
	runPromptOptimization,
	runPromptOptimizationSession,
} from "../services/prompt-optimizer";
import { registerSessionAiBatchId } from "../services/session-store";

// ============================================================================
// Constants
// ============================================================================

const EVAL_SET_PATHS = [
	resolve(process.cwd(), "eval_set.csv"),
	resolve(process.cwd(), "../../eval_set.csv"),
	resolve(process.cwd(), "../../../eval_set.csv"),
];

const DEFAULT_OPTIMIZATION_OPTIONS = {
	populationSize: 6,
	generations: 5,
	sampleSize: 30,
};

// ============================================================================
// Pure Functions
// ============================================================================

/** Get the AI provider config from environment */
const getProviderConfig = (): AIProviderConfig => ({
	openaiApiKey: env.OPENAI_API_KEY,
	anthropicApiKey: env.ANTHROPIC_API_KEY,
	geminiApiKey: env.GEMINI_API_KEY,
});

/** Initialize AI provider from environment */
const initializeAIProvider = () => {
	const config = getProviderConfig();
	return initAIProvider(
		config.openaiApiKey,
		config.anthropicApiKey,
		config.geminiApiKey,
	);
};

/** Get the provider to use (from input or default) */
const resolveProvider = (inputProvider?: AIProvider): AIProvider =>
	inputProvider ?? (env.AI_PROVIDER as AIProvider);

/** Generate a unique run ID */
const generateRunId = (): string => `opt_${Date.now()}`;

/** Try to read a file from multiple paths */
const readFileFromPaths = (
	paths: string[],
): { content: string; path: string } | null => {
	for (const path of paths) {
		try {
			const content = readFileSync(path, "utf-8");
			return { content, path };
		} catch {}
	}
	return null;
};

/** Calculate eval set statistics */
const calculateEvalSetStats = (evalLeads: EvalLead[]) => ({
	totalLeads: evalLeads.length,
	relevantLeads: evalLeads.filter((l) => l.expectedRank !== null).length,
	irrelevantLeads: evalLeads.filter((l) => l.expectedRank === null).length,
	uniqueCompanies: new Set(evalLeads.map((l) => l.company)).size,
});

// ============================================================================
// Eval Set Cache
// ============================================================================

let evalSetCache: EvalLead[] | null = null;

/** Load and cache the eval set */
const getEvalSet = (): EvalLead[] => {
	if (evalSetCache !== null) return evalSetCache;

	const result = readFileFromPaths(EVAL_SET_PATHS);
	if (!result) {
		console.error("Failed to load eval_set.csv: file not found");
		evalSetCache = [];
		return evalSetCache;
	}

	evalSetCache = parseEvalSet(result.content);
	console.log(`Loaded ${evalSetCache.length} eval leads from ${result.path}`);
	return evalSetCache;
};

// ============================================================================
// Input Schemas
// ============================================================================

const startInputSchema = z
	.object({
		provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
		populationSize: z
			.number()
			.min(3)
			.max(20)
			.default(DEFAULT_OPTIMIZATION_OPTIONS.populationSize),
		generations: z
			.number()
			.min(1)
			.max(20)
			.default(DEFAULT_OPTIMIZATION_OPTIONS.generations),
		sampleSize: z
			.number()
			.min(10)
			.max(100)
			.default(DEFAULT_OPTIMIZATION_OPTIONS.sampleSize),
	})
	.optional();

const progressInputSchema = z.object({
	runId: z.string(),
});

const activateInputSchema = z.object({
	version: z.number(),
});

const startSessionInputSchema = z.object({
	sessionId: z.string().min(1),
	csv: z.string().min(1),
	provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
	populationSize: z
		.number()
		.min(3)
		.max(20)
		.default(DEFAULT_OPTIMIZATION_OPTIONS.populationSize),
	generations: z
		.number()
		.min(1)
		.max(20)
		.default(DEFAULT_OPTIMIZATION_OPTIONS.generations),
	sampleSize: z
		.number()
		.min(10)
		.max(100)
		.default(DEFAULT_OPTIMIZATION_OPTIONS.sampleSize),
});

// ============================================================================
// Router
// ============================================================================

export const optimizerRouter = router({
	start: publicProcedure.input(startInputSchema).mutation(async ({ input }) => {
		initializeAIProvider();

		const provider = resolveProvider(input?.provider);
		const runId = generateRunId();
		const evalLeads = getEvalSet();

		if (evalLeads.length === 0) {
			throw new Error(
				"No evaluation data available. Please ensure eval_set.csv exists.",
			);
		}

		// Start optimization in background
		runPromptOptimization(evalLeads, provider, runId, {
			populationSize:
				input?.populationSize ?? DEFAULT_OPTIMIZATION_OPTIONS.populationSize,
			generations:
				input?.generations ?? DEFAULT_OPTIMIZATION_OPTIONS.generations,
			sampleSize: input?.sampleSize ?? DEFAULT_OPTIMIZATION_OPTIONS.sampleSize,
		}).catch((error) => {
			console.error("Optimization failed:", error);
		});

		return {
			runId,
			message: "Optimization started",
			evalLeadsCount: evalLeads.length,
		};
	}),

	startSession: publicProcedure
		.input(startSessionInputSchema)
		.mutation(async ({ input }) => {
			initializeAIProvider();

			const provider = resolveProvider(input.provider);
			const runId = generateRunId();
			const evalLeads = parseEvalSet(input.csv);

			if (evalLeads.length === 0) {
				throw new Error(
					"No evaluation data found. Ensure the CSV matches the eval_set format.",
				);
			}

			registerSessionAiBatchId(input.sessionId, runId);

			runPromptOptimizationSession(
				evalLeads,
				provider,
				runId,
				input.sessionId,
				{
					populationSize: input.populationSize,
					generations: input.generations,
					sampleSize: input.sampleSize,
				},
			).catch((error) => {
				console.error("Session optimization failed:", error);
			});

			return {
				runId,
				message: "Session optimization started",
				evalLeadsCount: evalLeads.length,
			};
		}),

	progress: publicProcedure
		.input(progressInputSchema)
		.query(
			async ({ input }): Promise<OptimizationProgress> =>
				getOptimizationProgress(input.runId),
		),

	history: publicProcedure.query(async () => getOptimizationHistory()),

	activate: publicProcedure
		.input(activateInputSchema)
		.mutation(async ({ input }) => {
			await activatePrompt(input.version);
			return { success: true };
		}),

	evalSetInfo: publicProcedure.query(async () =>
		calculateEvalSetStats(getEvalSet()),
	),
});
