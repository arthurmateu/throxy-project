import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { desc, eq } from "drizzle-orm";
import { type AIProvider, getAIProvider } from "./ai-provider";

const { prompts, aiCallLogs } = schema;

// ============================================================================
// Types
// ============================================================================

/** Evaluation lead from eval_set.csv */
export interface EvalLead {
	fullName: string;
	title: string;
	company: string;
	linkedIn: string;
	employeeRange: string;
	expectedRank: number | null; // null means irrelevant ("-")
}

/** Prompt candidate for genetic algorithm */
export interface PromptCandidate {
	content: string;
	version: number;
	fitness: number;
	generation: number;
	parentVersion?: number;
}

/** Optimization progress */
export interface OptimizationProgress {
	status: "idle" | "running" | "completed" | "error";
	currentGeneration: number;
	totalGenerations: number;
	populationSize: number;
	bestFitness: number;
	currentBestPrompt?: string;
	evaluationsRun: number;
	error?: string;
}

interface Prediction {
	lead: EvalLead;
	predicted: number | null;
	actual: number | null;
}

interface ErrorAnalysis {
	falsePositives: number;
	falseNegatives: number;
	rankTooHigh: number;
	rankTooLow: number;
}

interface OptimizationOptions {
	populationSize?: number;
	generations?: number;
	mutationRate?: number;
	eliteCount?: number;
	sampleSize?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROGRESS: OptimizationProgress = {
	status: "idle",
	currentGeneration: 0,
	totalGenerations: 0,
	populationSize: 0,
	bestFitness: 0,
	evaluationsRun: 0,
};

const DEFAULT_OPTIONS: Required<OptimizationOptions> = {
	populationSize: 6,
	generations: 5,
	mutationRate: 0.7,
	eliteCount: 2,
	sampleSize: 30,
};

const PROMPT_PREVIEW_LENGTH = 200;
const TOURNAMENT_SIZE = 3;
const QUICK_EVAL_SAMPLE_SIZE = 10;

// ============================================================================
// Progress State Management
// ============================================================================

const optimizationProgressMap = new Map<string, OptimizationProgress>();

/** Get optimization progress for a run */
export const getOptimizationProgress = (runId: string): OptimizationProgress =>
	optimizationProgressMap.get(runId) ?? { ...DEFAULT_PROGRESS };

/** Update progress immutably */
const updateOptimizationProgress = (
	runId: string,
	update: Partial<OptimizationProgress>,
): OptimizationProgress => {
	const current = getOptimizationProgress(runId);
	const updated = { ...current, ...update };
	optimizationProgressMap.set(runId, updated);
	return updated;
};

// ============================================================================
// Pure Functions - CSV Parsing
// ============================================================================

/** Parse a CSV line handling quoted fields */
const parseCsvLine = (line: string): string[] => {
	const values: string[] = [];
	let current = "";
	let inQuotes = false;

	for (const char of line) {
		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === "," && !inQuotes) {
			values.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	values.push(current.trim());

	return values;
};

/** Parse rank string to number or null */
const parseRank = (rankStr: string): number | null => {
	const trimmed = rankStr.trim();
	if (trimmed === "-" || trimmed === "") return null;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isNaN(parsed) ? null : parsed;
};

/** Convert CSV values to EvalLead */
const toEvalLead = (values: string[]): EvalLead | null => {
	if (values.length < 6) return null;

	return {
		fullName: values[0] ?? "",
		title: values[1] ?? "",
		company: values[2] ?? "",
		linkedIn: values[3] ?? "",
		employeeRange: values[4] ?? "",
		expectedRank: parseRank(values[5] ?? ""),
	};
};

/** Parse the eval_set.csv content */
export const parseEvalSet = (csvContent: string): EvalLead[] => {
	const lines = csvContent.trim().split("\n");

	return lines
		.slice(1) // Skip header
		.filter((line) => line.trim() !== "")
		.map(parseCsvLine)
		.map(toEvalLead)
		.filter((lead): lead is EvalLead => lead !== null);
};

// ============================================================================
// Pure Functions - Fitness Calculation
// ============================================================================

/** Calculate score for a single prediction */
const scorePrediction = (
	predicted: number | null,
	actual: number | null,
): number => {
	const actualIsRelevant = actual !== null;
	const predictedIsRelevant = predicted !== null;

	// Relevance mismatch - no points
	if (actualIsRelevant !== predictedIsRelevant) return 0;

	// Both irrelevant - full points
	if (!actualIsRelevant) return 1;

	// Both relevant - score based on rank distance
	const maxDist = 9;
	const distance = Math.abs((predicted as number) - (actual as number));
	return 1 - distance / maxDist;
};

/** Calculate fitness based on ranking accuracy */
const calculateFitness = (predictions: Prediction[]): number => {
	if (predictions.length === 0) return 0;

	const totalScore = predictions.reduce(
		(sum, { predicted, actual }) => sum + scorePrediction(predicted, actual),
		0,
	);

	return totalScore / predictions.length;
};

// ============================================================================
// Pure Functions - Prompt Building
// ============================================================================

/** Format a lead for evaluation prompt */
const formatEvalLead = (lead: EvalLead, index: number): string =>
	`${index + 1}. Name: ${lead.fullName}
   Title: ${lead.title}`;

/** Build evaluation prompt for a company batch */
const buildEvalPrompt = (
	promptContent: string,
	company: string,
	companyLeads: EvalLead[],
): string => {
	const employeeRange = companyLeads[0]?.employeeRange ?? "Unknown size";
	const leadsInfo = companyLeads.map(formatEvalLead).join("\n\n");

	return `${promptContent}

---

Now rank the following leads from ${company} (${employeeRange} employees):

${leadsInfo}

Respond with a JSON object in this exact format:
{
  "rankings": [
    {
      "name": "<lead name>",
      "rank": <number 1-10 or null if irrelevant>
    }
  ]
}`;
};

// ============================================================================
// Pure Functions - Response Parsing
// ============================================================================

/** Extract JSON from response string */
const extractJsonFromResponse = (content: string): object | null => {
	const match = content.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		return JSON.parse(match[0]);
	} catch {
		return null;
	}
};

/** Find a lead by name (case-insensitive) */
const findLeadByName = (
	leads: EvalLead[],
	name: string,
): EvalLead | undefined =>
	leads.find((l) => l.fullName.toLowerCase() === name?.toLowerCase());

/** Parse ranking results from response */
const parseEvalResponse = (
	content: string,
	companyLeads: EvalLead[],
): Prediction[] => {
	const predictions: Prediction[] = [];
	const processedNames = new Set<string>();

	const parsed = extractJsonFromResponse(content);
	if (parsed && Array.isArray((parsed as { rankings?: unknown[] }).rankings)) {
		for (const result of (
			parsed as { rankings: Array<{ name?: string; rank?: number | null }> }
		).rankings) {
			const lead = findLeadByName(companyLeads, result.name ?? "");
			if (lead) {
				predictions.push({
					lead,
					predicted: result.rank === null ? null : Number(result.rank),
					actual: lead.expectedRank,
				});
				processedNames.add(lead.fullName);
			}
		}
	}

	// Add missing leads as failed predictions
	for (const lead of companyLeads) {
		if (!processedNames.has(lead.fullName)) {
			predictions.push({ lead, predicted: null, actual: lead.expectedRank });
		}
	}

	return predictions;
};

// ============================================================================
// Pure Functions - Data Transformation
// ============================================================================

/** Group leads by company */
const groupByCompany = (leads: EvalLead[]): Map<string, EvalLead[]> => {
	const grouped = new Map<string, EvalLead[]>();
	for (const lead of leads) {
		const existing = grouped.get(lead.company) ?? [];
		grouped.set(lead.company, [...existing, lead]);
	}
	return grouped;
};

/** Sample random items from array */
const sampleArray = <T>(array: T[], size: number): T[] => {
	if (array.length <= size) return array;
	const shuffled = [...array].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, size);
};

// ============================================================================
// Database Operations
// ============================================================================

/** Log an AI call to database */
const logAiCall = async (
	provider: AIProvider,
	response: {
		model: string;
		inputTokens: number;
		outputTokens: number;
		cost: number;
		durationMs: number;
	},
	batchId: string,
): Promise<void> => {
	await db.insert(aiCallLogs).values({
		provider,
		model: response.model,
		inputTokens: response.inputTokens,
		outputTokens: response.outputTokens,
		cost: response.cost,
		durationMs: response.durationMs,
		batchId,
	});
};

// ============================================================================
// AI Operations - Evaluation
// ============================================================================

/** Process a single company batch for evaluation */
const evaluateCompanyBatch = async (
	promptContent: string,
	company: string,
	companyLeads: EvalLead[],
	provider: AIProvider,
	runId: string,
): Promise<Prediction[]> => {
	const ai = getAIProvider();
	const userPrompt = buildEvalPrompt(promptContent, company, companyLeads);

	try {
		const response = await ai.chat(
			provider,
			[{ role: "user", content: userPrompt }],
			{
				jsonMode: true,
				temperature: 0.1,
			},
		);

		await logAiCall(provider, response, runId);
		return parseEvalResponse(response.content, companyLeads);
	} catch {
		// On error, mark all leads as failed predictions
		return companyLeads.map((lead) => ({
			lead,
			predicted: null,
			actual: lead.expectedRank,
		}));
	}
};

/** Evaluate a prompt against the eval set */
const evaluatePrompt = async (
	promptContent: string,
	evalLeads: EvalLead[],
	provider: AIProvider,
	runId: string,
): Promise<{ fitness: number; predictions: Prediction[] }> => {
	const companiesMap = groupByCompany(evalLeads);
	const predictions: Prediction[] = [];

	for (const [company, companyLeads] of companiesMap.entries()) {
		const companyPredictions = await evaluateCompanyBatch(
			promptContent,
			company,
			companyLeads,
			provider,
			runId,
		);
		predictions.push(...companyPredictions);
	}

	return { fitness: calculateFitness(predictions), predictions };
};

// ============================================================================
// Pure Functions - Error Analysis
// ============================================================================

/** Analyze predictions to find error patterns */
const analyzeErrorPatterns = (predictions: Prediction[]): ErrorAnalysis => {
	const analysis: ErrorAnalysis = {
		falsePositives: 0,
		falseNegatives: 0,
		rankTooHigh: 0,
		rankTooLow: 0,
	};

	for (const { predicted, actual } of predictions) {
		const actualIsRelevant = actual !== null;
		const predictedIsRelevant = predicted !== null;

		if (predictedIsRelevant && !actualIsRelevant) {
			analysis.falsePositives++;
		} else if (!predictedIsRelevant && actualIsRelevant) {
			analysis.falseNegatives++;
		} else if (predictedIsRelevant && actualIsRelevant) {
			if ((predicted as number) < (actual as number)) {
				analysis.rankTooHigh++;
			} else if ((predicted as number) > (actual as number)) {
				analysis.rankTooLow++;
			}
		}
	}

	return analysis;
};

/** Convert error analysis to human-readable strings */
const formatErrors = (analysis: ErrorAnalysis): string[] => {
	const errors: string[] = [];

	if (analysis.falsePositives > 0) {
		errors.push(
			`- Marking ${analysis.falsePositives} irrelevant leads as relevant. Be stricter about excluding HR, Finance, Engineering, and other non-sales roles.`,
		);
	}
	if (analysis.falseNegatives > 0) {
		errors.push(
			`- Missing ${analysis.falseNegatives} relevant leads (marking them as irrelevant). Be more inclusive of sales-adjacent roles.`,
		);
	}
	if (analysis.rankTooHigh > 0) {
		errors.push(
			`- Ranking ${analysis.rankTooHigh} leads too highly (predicted rank lower than actual). Be more conservative with top rankings.`,
		);
	}
	if (analysis.rankTooLow > 0) {
		errors.push(
			`- Ranking ${analysis.rankTooLow} leads too low (predicted rank higher than actual). Better recognize high-value titles.`,
		);
	}

	return errors;
};

/** Analyze errors and format them */
const analyzeErrors = (predictions: Prediction[]): string[] =>
	formatErrors(analyzeErrorPatterns(predictions));

// ============================================================================
// Pure Functions - Genetic Algorithm Helpers
// ============================================================================

/** Tournament selection - pick best from random subset */
const tournamentSelect = (
	population: PromptCandidate[],
	tournamentSize: number,
): PromptCandidate => {
	const tournament = Array.from({ length: tournamentSize }, () => {
		const randomIndex = Math.floor(Math.random() * population.length);
		const candidate = population[randomIndex];
		if (!candidate) throw new Error("Population is empty");
		return candidate;
	});

	return tournament.reduce((best, current) =>
		current.fitness > best.fitness ? current : best,
	);
};

/** Create a new candidate from content */
const createCandidate = (
	content: string,
	version: number,
	generation: number,
	parentVersion?: number,
): PromptCandidate => ({
	content,
	version,
	fitness: 0,
	generation,
	parentVersion,
});

// ============================================================================
// Pure Functions - Prompt Templates
// ============================================================================

/** Build mutation prompt */
const buildMutationPrompt = (
	parentPrompt: string,
	errorPatterns: string[],
): string =>
	`You are an expert at optimizing prompts for AI lead qualification systems.

Here is the current prompt being used:
---
${parentPrompt}
---

The prompt has the following issues based on evaluation:
${errorPatterns.join("\n")}

Please create an improved version of this prompt that:
1. Addresses the identified issues
2. Maintains the core ranking criteria
3. Is clear and specific about how to rank leads
4. Handles edge cases better

Return ONLY the improved prompt text, nothing else.`;

/** Build crossover prompt */
const buildCrossoverPrompt = (parent1: string, parent2: string): string =>
	`You are an expert at optimizing prompts for AI lead qualification systems.

Here are two successful prompts:

PROMPT A:
---
${parent1}
---

PROMPT B:
---
${parent2}
---

Create a new prompt that combines the best elements of both prompts. The new prompt should:
1. Take the clearest instructions from each
2. Combine their ranking criteria effectively
3. Be coherent and well-structured

Return ONLY the new combined prompt text, nothing else.`;

// ============================================================================
// AI Operations - Genetic Operators
// ============================================================================

/** Mutate a prompt using AI */
const mutatePrompt = async (
	parentPrompt: string,
	errorPatterns: string[],
	provider: AIProvider,
	runId: string,
): Promise<string> => {
	const ai = getAIProvider();
	const prompt = buildMutationPrompt(parentPrompt, errorPatterns);

	const response = await ai.chat(
		provider,
		[{ role: "user", content: prompt }],
		{
			temperature: 0.7,
			maxTokens: 4000,
		},
	);

	await logAiCall(provider, response, runId);
	return response.content.trim();
};

/** Crossover two prompts using AI */
const crossoverPrompts = async (
	parent1: string,
	parent2: string,
	provider: AIProvider,
	runId: string,
): Promise<string> => {
	const ai = getAIProvider();
	const prompt = buildCrossoverPrompt(parent1, parent2);

	const response = await ai.chat(
		provider,
		[{ role: "user", content: prompt }],
		{
			temperature: 0.5,
			maxTokens: 4000,
		},
	);

	await logAiCall(provider, response, runId);
	return response.content.trim();
};

// ============================================================================
// Optimization Process - Internal Helpers
// ============================================================================

/** Fetch the active base prompt */
const fetchBasePrompt = async () => {
	const result = await db
		.select()
		.from(prompts)
		.where(eq(prompts.isActive, true))
		.orderBy(desc(prompts.version))
		.limit(1);

	if (result.length === 0 || !result[0]) {
		throw new Error("No active prompt found");
	}

	return result[0];
};

/** Save the best prompt to database */
const saveBestPrompt = async (candidate: PromptCandidate): Promise<void> => {
	await db.insert(prompts).values({
		version: candidate.version,
		content: candidate.content,
		evalScore: candidate.fitness,
		isActive: false,
		generation: candidate.generation,
		parentVersion: candidate.parentVersion,
	});
};

/** Initialize the population with base prompt and mutations */
const initializePopulation = async (
	baseContent: string,
	baseVersion: number,
	populationSize: number,
	provider: AIProvider,
	runId: string,
): Promise<{ population: PromptCandidate[]; nextVersion: number }> => {
	const initialErrors = [
		"- Initial evaluation: creating diverse variations to explore the solution space.",
	];

	const population: PromptCandidate[] = [
		createCandidate(baseContent, baseVersion, 0),
	];

	let nextVersion = baseVersion + 1;

	for (let i = 1; i < populationSize; i++) {
		const mutated = await mutatePrompt(
			baseContent,
			initialErrors,
			provider,
			runId,
		);
		population.push(createCandidate(mutated, nextVersion++, 0));
	}

	return { population, nextVersion };
};

/** Evaluate all candidates in population */
const evaluatePopulation = async (
	population: PromptCandidate[],
	evalLeads: EvalLead[],
	provider: AIProvider,
	runId: string,
	startFrom = 0,
): Promise<number> => {
	let evaluationsRun = 0;

	for (let i = startFrom; i < population.length; i++) {
		const candidate = population[i];
		if (!candidate) continue;
		const { fitness } = await evaluatePrompt(
			candidate.content,
			evalLeads,
			provider,
			runId,
		);
		candidate.fitness = fitness;
		evaluationsRun++;
	}

	return evaluationsRun;
};

/** Sort population by fitness (descending) */
const sortByFitness = (population: PromptCandidate[]): PromptCandidate[] =>
	[...population].sort((a, b) => b.fitness - a.fitness);

/** Generate a single offspring through mutation or crossover */
const generateOffspring = async (
	population: PromptCandidate[],
	sampledLeads: EvalLead[],
	mutationRate: number,
	provider: AIProvider,
	runId: string,
	version: number,
	generation: number,
	initialErrors: string[],
): Promise<{ candidate: PromptCandidate; extraEvaluations: number }> => {
	const parent1 = tournamentSelect(population, TOURNAMENT_SIZE);
	const parent2 = tournamentSelect(population, TOURNAMENT_SIZE);

	let childContent: string;
	let extraEvaluations = 0;

	if (Math.random() < mutationRate) {
		const parent = Math.random() < 0.5 ? parent1 : parent2;
		const { predictions } = await evaluatePrompt(
			parent.content,
			sampleArray(sampledLeads, QUICK_EVAL_SAMPLE_SIZE),
			provider,
			runId,
		);
		extraEvaluations = 1;

		const errors = analyzeErrors(predictions);
		childContent = await mutatePrompt(
			parent.content,
			errors.length > 0 ? errors : initialErrors,
			provider,
			runId,
		);
	} else {
		childContent = await crossoverPrompts(
			parent1.content,
			parent2.content,
			provider,
			runId,
		);
	}

	return {
		candidate: createCandidate(
			childContent,
			version,
			generation,
			parent1.version,
		),
		extraEvaluations,
	};
};

/** Run a single generation of evolution */
const runGeneration = async (
	population: PromptCandidate[],
	sampledLeads: EvalLead[],
	options: Required<OptimizationOptions>,
	provider: AIProvider,
	runId: string,
	generation: number,
	nextVersion: number,
	initialErrors: string[],
): Promise<{
	newPopulation: PromptCandidate[];
	nextVersion: number;
	evaluationsRun: number;
}> => {
	const { populationSize, mutationRate, eliteCount } = options;

	// Elitism - keep top performers
	const newPopulation: PromptCandidate[] = population
		.slice(0, eliteCount)
		.map((c) => ({ ...c, generation }));

	let currentVersion = nextVersion;
	let evaluationsRun = 0;

	// Generate new candidates
	while (newPopulation.length < populationSize) {
		const { candidate, extraEvaluations } = await generateOffspring(
			population,
			sampledLeads,
			mutationRate,
			provider,
			runId,
			currentVersion++,
			generation,
			initialErrors,
		);
		newPopulation.push(candidate);
		evaluationsRun += extraEvaluations;
	}

	// Evaluate new candidates (skip elites)
	evaluationsRun += await evaluatePopulation(
		newPopulation,
		sampledLeads,
		provider,
		runId,
		eliteCount,
	);

	return {
		newPopulation: sortByFitness(newPopulation),
		nextVersion: currentVersion,
		evaluationsRun,
	};
};

// ============================================================================
// Main Optimization Function
// ============================================================================

/** Run the prompt optimization process */
export const runPromptOptimization = async (
	evalLeads: EvalLead[],
	provider: AIProvider,
	runId: string,
	options: OptimizationOptions = {},
): Promise<void> => {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const { populationSize, generations, sampleSize } = opts;
	const initialErrors = [
		"- Initial evaluation: creating diverse variations to explore the solution space.",
	];

	try {
		updateOptimizationProgress(runId, {
			status: "running",
			totalGenerations: generations,
			populationSize,
			currentGeneration: 0,
			bestFitness: 0,
			evaluationsRun: 0,
		});

		const basePrompt = await fetchBasePrompt();
		const sampledLeads = sampleArray(evalLeads, sampleSize);

		// Initialize population
		let { population, nextVersion } = await initializePopulation(
			basePrompt.content,
			basePrompt.version,
			populationSize,
			provider,
			runId,
		);

		// Evaluate initial population
		let totalEvaluations = await evaluatePopulation(
			population,
			sampledLeads,
			provider,
			runId,
		);
		updateOptimizationProgress(runId, { evaluationsRun: totalEvaluations });

		population = sortByFitness(population);
		const firstCandidate = population[0];
		if (!firstCandidate) throw new Error("No candidates in population");
		let bestCandidate = firstCandidate;

		updateOptimizationProgress(runId, {
			bestFitness: bestCandidate.fitness,
			currentBestPrompt: `${bestCandidate.content.substring(0, PROMPT_PREVIEW_LENGTH)}...`,
		});

		// Evolution loop
		for (let gen = 1; gen <= generations; gen++) {
			updateOptimizationProgress(runId, { currentGeneration: gen });

			const result = await runGeneration(
				population,
				sampledLeads,
				opts,
				provider,
				runId,
				gen,
				nextVersion,
				initialErrors,
			);

			population = result.newPopulation;
			nextVersion = result.nextVersion;
			totalEvaluations += result.evaluationsRun;
			updateOptimizationProgress(runId, { evaluationsRun: totalEvaluations });

			const topCandidate = population[0];
			if (topCandidate && topCandidate.fitness > bestCandidate.fitness) {
				bestCandidate = topCandidate;
				updateOptimizationProgress(runId, {
					bestFitness: bestCandidate.fitness,
					currentBestPrompt: `${bestCandidate.content.substring(0, PROMPT_PREVIEW_LENGTH)}...`,
				});
			}

			console.log(
				`Generation ${gen}: Best fitness = ${bestCandidate.fitness.toFixed(3)}`,
			);
		}

		await saveBestPrompt(bestCandidate);

		updateOptimizationProgress(runId, {
			status: "completed",
			bestFitness: bestCandidate.fitness,
		});
	} catch (error) {
		updateOptimizationProgress(runId, {
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		throw error;
	}
};

// ============================================================================
// Query Operations
// ============================================================================

/** Get optimization history */
export const getOptimizationHistory = async () =>
	db
		.select({
			version: prompts.version,
			evalScore: prompts.evalScore,
			isActive: prompts.isActive,
			generation: prompts.generation,
			createdAt: prompts.createdAt,
		})
		.from(prompts)
		.orderBy(desc(prompts.version));

/** Activate a specific prompt version */
export const activatePrompt = async (version: number): Promise<void> => {
	await db.update(prompts).set({ isActive: false });
	await db
		.update(prompts)
		.set({ isActive: true })
		.where(eq(prompts.version, version));
};
