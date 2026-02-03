import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { type AIProvider, type AIResponse, getAIProvider } from "./ai-provider";

const { leads, rankings, aiCallLogs, prompts } = schema;
type NewRanking = schema.NewRanking;
type NewAiCallLog = schema.NewAiCallLog;

// ============================================================================
// Types
// ============================================================================

export interface RankingResult {
	leadId: string;
	rank: number | null;
	reasoning: string;
}

export interface RankingProgress {
	total: number;
	completed: number;
	currentCompany: string | null;
	status: "idle" | "running" | "completed" | "error";
	error?: string;
}

interface LeadForRanking {
	id: string;
	firstName: string;
	lastName: string;
	jobTitle: string;
	accountName: string;
	employeeRange: string | null;
	industry: string | null;
}

interface LeadsQueryOptions {
	page?: number;
	pageSize?: number;
	sortBy?: "rank" | "name" | "company";
	sortOrder?: "asc" | "desc";
	showIrrelevant?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROGRESS: RankingProgress = {
	total: 0,
	completed: 0,
	currentCompany: null,
	status: "idle",
};

const DEFAULT_QUERY_OPTIONS: Required<LeadsQueryOptions> = {
	page: 1,
	pageSize: 50,
	sortBy: "rank",
	sortOrder: "asc",
	showIrrelevant: true,
};

// ============================================================================
// Progress State Management (Functional Approach)
// ============================================================================

const progressMap = new Map<string, RankingProgress>();

/** Get progress for a batch (pure read) */
export const getRankingProgress = (batchId: string): RankingProgress =>
	progressMap.get(batchId) ?? { ...DEFAULT_PROGRESS };

/** Update progress immutably and store */
const updateProgress = (
	batchId: string,
	update: Partial<RankingProgress>,
): RankingProgress => {
	const current = getRankingProgress(batchId);
	const updated = { ...current, ...update };
	progressMap.set(batchId, updated);
	return updated;
};

// ============================================================================
// Pure Functions - Prompt Building
// ============================================================================

/** Format a single lead for the prompt */
const formatLeadForPrompt = (lead: LeadForRanking, index: number): string =>
	`${index + 1}. ID: ${lead.id}
   Name: ${lead.firstName} ${lead.lastName}
   Title: ${lead.jobTitle}`;

/** Build the ranking prompt from system prompt and leads */
const buildRankingPrompt = (
	systemPrompt: string,
	companyLeads: LeadForRanking[],
): string => {
	const company = companyLeads[0];
	if (!company) throw new Error("No leads provided");

	const leadsInfo = companyLeads.map(formatLeadForPrompt).join("\n\n");
	const companySize = company.employeeRange ?? "Unknown size";
	const industry = company.industry ?? "Unknown";

	return `${systemPrompt}

---

Now rank the following leads from ${company.accountName} (${companySize} employees, Industry: ${industry}):

${leadsInfo}

Respond with a JSON object in this exact format:
{
  "rankings": [
    {
      "leadId": "<lead id>",
      "rank": <number 1-10 or null if irrelevant>,
      "reasoning": "<brief explanation>"
    }
  ]
}

Important:
- Use null for rank if the lead is in a hard exclusion category (HR, Finance, Engineering, etc.)
- Lower numbers = better fit (1 is the best)
- Consider company size when ranking - a CEO at a startup ranks differently than at an enterprise
- Be concise in your reasoning (1-2 sentences max)`;
};

// ============================================================================
// Pure Functions - Response Parsing
// ============================================================================

/** Extract JSON from a string response */
const extractJson = (response: string): object | null => {
	const jsonMatch = response.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return null;
	try {
		return JSON.parse(jsonMatch[0]);
	} catch {
		return null;
	}
};

/** Create a failed ranking result */
const createFailedResult = (leadId: string, reason: string): RankingResult => ({
	leadId,
	rank: null,
	reasoning: reason,
});

/** Parse a single ranking item from the response */
const parseRankingItem = (item: {
	leadId?: string;
	rank?: number | null;
	reasoning?: string;
}): RankingResult | null => {
	if (!item.leadId) return null;
	return {
		leadId: item.leadId,
		rank: item.rank === null ? null : Number(item.rank),
		reasoning: String(item.reasoning ?? ""),
	};
};

/** Parse the ranking response into results */
const parseRankingResponse = (
	response: string,
	leadIds: string[],
): RankingResult[] => {
	const parsed = extractJson(response);
	if (!parsed) {
		return leadIds.map((id) =>
			createFailedResult(id, "No JSON found in response"),
		);
	}

	const rankings = (parsed as { rankings?: unknown[] }).rankings;
	if (!Array.isArray(rankings)) {
		return leadIds.map((id) =>
			createFailedResult(id, "Invalid response format"),
		);
	}

	const results: RankingResult[] = [];
	const processedIds = new Set<string>();

	for (const item of rankings) {
		const result = parseRankingItem(
			item as { leadId?: string; rank?: number | null; reasoning?: string },
		);
		if (result && leadIds.includes(result.leadId)) {
			results.push(result);
			processedIds.add(result.leadId);
		}
	}

	// Add missing leads as failed
	for (const id of leadIds) {
		if (!processedIds.has(id)) {
			results.push(
				createFailedResult(id, "Failed to parse ranking from AI response"),
			);
		}
	}

	return results;
};

// ============================================================================
// Pure Functions - Data Transformation
// ============================================================================

/** Group leads by company name */
const groupLeadsByCompany = (
	allLeads: LeadForRanking[],
): Map<string, LeadForRanking[]> => {
	const grouped = new Map<string, LeadForRanking[]>();
	for (const lead of allLeads) {
		const existing = grouped.get(lead.accountName) ?? [];
		grouped.set(lead.accountName, [...existing, lead]);
	}
	return grouped;
};

/** Convert ranking result to database entry */
const toRankingEntry = (
	result: RankingResult,
	promptVersion: number,
): NewRanking => ({
	leadId: result.leadId,
	rank: result.rank,
	relevanceScore: result.rank !== null ? (11 - result.rank) / 10 : 0,
	reasoning: result.reasoning,
	promptVersion,
});

/** Convert AI response to log entry */
const toAiCallLogEntry = (
	aiResponse: AIResponse,
	provider: AIProvider,
	batchId: string,
	promptVersion: number,
): NewAiCallLog => ({
	provider,
	model: aiResponse.model,
	inputTokens: aiResponse.inputTokens,
	outputTokens: aiResponse.outputTokens,
	cost: aiResponse.cost,
	durationMs: aiResponse.durationMs,
	promptVersion,
	batchId,
});

/** Calculate pagination info */
const calculatePagination = (
	page: number,
	pageSize: number,
	totalCount: number,
) => ({
	page,
	pageSize,
	totalCount,
	totalPages: Math.ceil(totalCount / pageSize),
});

// ============================================================================
// Database Operations
// ============================================================================

/** Fetch the active prompt from database */
export const getActivePrompt = async (): Promise<string> => {
	const activePrompt = await db
		.select()
		.from(prompts)
		.where(eq(prompts.isActive, true))
		.orderBy(desc(prompts.version))
		.limit(1);

	if (activePrompt.length === 0 || !activePrompt[0]) {
		throw new Error("No active prompt found. Please run the seed script.");
	}

	return activePrompt[0].content;
};

/** Fetch the active prompt version */
export const getActivePromptVersion = async (): Promise<number> => {
	const activePrompt = await db
		.select({ version: prompts.version })
		.from(prompts)
		.where(eq(prompts.isActive, true))
		.orderBy(desc(prompts.version))
		.limit(1);

	return activePrompt[0]?.version ?? 1;
};

/** Fetch all leads for ranking */
const fetchAllLeads = async (): Promise<LeadForRanking[]> =>
	db
		.select({
			id: leads.id,
			firstName: leads.firstName,
			lastName: leads.lastName,
			jobTitle: leads.jobTitle,
			accountName: leads.accountName,
			employeeRange: leads.employeeRange,
			industry: leads.industry,
		})
		.from(leads);

/** Save rankings to database */
const saveRankings = async (rankingsToInsert: NewRanking[]): Promise<void> => {
	await db.insert(rankings).values(rankingsToInsert);
};

/** Log an AI call */
const logAiCall = async (logEntry: NewAiCallLog): Promise<void> => {
	await db.insert(aiCallLogs).values(logEntry);
};

/** Clear all rankings */
const clearAllRankings = async (): Promise<void> => {
	await db.delete(rankings);
};

// ============================================================================
// AI Operations
// ============================================================================

/** Rank a batch of leads from one company */
export const rankLeadsBatch = async (
	companyLeads: LeadForRanking[],
	systemPrompt: string,
	provider: AIProvider,
	batchId: string,
	promptVersion: number,
): Promise<{ results: RankingResult[]; aiResponse: AIResponse }> => {
	const ai = getAIProvider();
	const userPrompt = buildRankingPrompt(systemPrompt, companyLeads);

	const aiResponse = await ai.chat(
		provider,
		[{ role: "user", content: userPrompt }],
		{
			jsonMode: true,
			temperature: 0.2,
		},
	);

	await logAiCall(
		toAiCallLogEntry(aiResponse, provider, batchId, promptVersion),
	);

	const leadIds = companyLeads.map((l) => l.id);
	const results = parseRankingResponse(aiResponse.content, leadIds);

	return { results, aiResponse };
};

// ============================================================================
// Main Ranking Process
// ============================================================================

/** Process a single company's leads */
const processCompany = async (
	companyName: string,
	companyLeads: LeadForRanking[],
	systemPrompt: string,
	provider: AIProvider,
	batchId: string,
	promptVersion: number,
): Promise<number> => {
	try {
		const { results } = await rankLeadsBatch(
			companyLeads,
			systemPrompt,
			provider,
			batchId,
			promptVersion,
		);
		const rankingsToInsert = results.map((r) =>
			toRankingEntry(r, promptVersion),
		);
		await saveRankings(rankingsToInsert);
		return companyLeads.length;
	} catch (error) {
		console.error(`Error ranking company ${companyName}:`, error);
		return companyLeads.length; // Continue with next company
	}
};

/** Run the full ranking process */
export const runRankingProcess = async (
	provider: AIProvider,
	batchId: string,
): Promise<void> => {
	try {
		const allLeads = await fetchAllLeads();
		const companiesMap = groupLeadsByCompany(allLeads);
		const companies = Array.from(companiesMap.entries());

		updateProgress(batchId, {
			total: allLeads.length,
			completed: 0,
			status: "running",
		});

		const [systemPrompt, promptVersion] = await Promise.all([
			getActivePrompt(),
			getActivePromptVersion(),
		]);

		await clearAllRankings();

		let completedLeads = 0;

		for (const [companyName, companyLeads] of companies) {
			updateProgress(batchId, { currentCompany: companyName });

			const processed = await processCompany(
				companyName,
				companyLeads,
				systemPrompt,
				provider,
				batchId,
				promptVersion,
			);

			completedLeads += processed;
			updateProgress(batchId, { completed: completedLeads });
		}

		updateProgress(batchId, { status: "completed", currentCompany: null });
	} catch (error) {
		updateProgress(batchId, {
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		throw error;
	}
};

// ============================================================================
// Query Operations
// ============================================================================

/** Build sort order SQL for leads query */
const buildSortOrder = (sortBy: string, sortOrder: string) => {
	const direction = sortOrder === "asc" ? "ASC" : "DESC";
	const nullHandling = sortOrder === "asc" ? 999 : -1;

	switch (sortBy) {
		case "rank":
			return sql`COALESCE(${rankings.rank}, ${nullHandling}) ${sql.raw(direction)}`;
		case "company":
			return sql`${leads.accountName} ${sql.raw(direction)}`;
		default:
			return sql`${leads.lastName} ${sql.raw(direction)}`;
	}
};

/** Get leads with their rankings */
export const getLeadsWithRankings = async (options: LeadsQueryOptions = {}) => {
	const { page, pageSize, sortBy, sortOrder, showIrrelevant } = {
		...DEFAULT_QUERY_OPTIONS,
		...options,
	};

	const offset = (page - 1) * pageSize;
	const relevantFilter = showIrrelevant
		? undefined
		: sql`${rankings.rank} IS NOT NULL`;

	// Base query
	let query = db
		.select({
			id: leads.id,
			firstName: leads.firstName,
			lastName: leads.lastName,
			jobTitle: leads.jobTitle,
			accountName: leads.accountName,
			accountDomain: leads.accountDomain,
			employeeRange: leads.employeeRange,
			industry: leads.industry,
			rank: rankings.rank,
			reasoning: rankings.reasoning,
			relevanceScore: rankings.relevanceScore,
		})
		.from(leads)
		.leftJoin(rankings, eq(leads.id, rankings.leadId));

	if (!showIrrelevant) {
		query = query.where(and(relevantFilter)) as typeof query;
	}

	// Get total count
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(leads)
		.leftJoin(rankings, eq(leads.id, rankings.leadId))
		.where(relevantFilter);

	const totalCount = Number(countResult[0]?.count ?? 0);

	// Apply sorting and pagination
	const results = await query
		.orderBy(buildSortOrder(sortBy, sortOrder))
		.limit(pageSize)
		.offset(offset);

	return {
		leads: results,
		pagination: calculatePagination(page, pageSize, totalCount),
	};
};

/** Get ranking statistics */
export const getRankingStats = async () => {
	const [totalLeadsResult, rankedResult, relevantResult, aiStatsResult] =
		await Promise.all([
			db.select({ count: sql<number>`count(*)` }).from(leads),
			db.select({ count: sql<number>`count(*)` }).from(rankings),
			db
				.select({ count: sql<number>`count(*)` })
				.from(rankings)
				.where(sql`${rankings.rank} IS NOT NULL`),
			db
				.select({
					totalCalls: sql<number>`count(*)`,
					totalCost: sql<number>`COALESCE(sum(${aiCallLogs.cost}), 0)`,
					totalInputTokens: sql<number>`COALESCE(sum(${aiCallLogs.inputTokens}), 0)`,
					totalOutputTokens: sql<number>`COALESCE(sum(${aiCallLogs.outputTokens}), 0)`,
					avgDuration: sql<number>`COALESCE(avg(${aiCallLogs.durationMs}), 0)`,
				})
				.from(aiCallLogs),
		]);

	const totalLeads = Number(totalLeadsResult[0]?.count ?? 0);
	const rankedLeads = Number(rankedResult[0]?.count ?? 0);
	const relevantLeads = Number(relevantResult[0]?.count ?? 0);
	const aiStats = aiStatsResult[0];

	return {
		totalLeads,
		rankedLeads,
		relevantLeads,
		irrelevantLeads: rankedLeads - relevantLeads,
		aiCalls: {
			totalCalls: Number(aiStats?.totalCalls ?? 0),
			totalCost: Number(aiStats?.totalCost ?? 0),
			totalInputTokens: Number(aiStats?.totalInputTokens ?? 0),
			totalOutputTokens: Number(aiStats?.totalOutputTokens ?? 0),
			avgDurationMs: Number(aiStats?.avgDuration ?? 0),
		},
	};
};
